package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Commit creates a new commit
func Commit(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse arguments
	var message string
	autoStage := false
	amend := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-m":
			if i+1 >= len(args) {
				return fmt.Errorf("option -m requires an argument")
			}
			message = args[i+1]
			i++
		case "-a":
			autoStage = true
		case "--amend":
			amend = true
		}
	}

	if message == "" && !amend {
		return fmt.Errorf("commit message required")
	}

	// Auto-stage if -a flag
	if autoStage {
		if err := autoStageTracked(repoRoot); err != nil {
			return err
		}
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	if len(idx.Entries) == 0 {
		return fmt.Errorf("nothing to commit")
	}

	// Get parent commit (if any)
	var parents []string
	parentSHA, err := refs.ResolveRef(repoRoot, "HEAD")
	if err == nil && parentSHA != "" {
		parents = append(parents, parentSHA)
	}

	// Handle amend
	if amend {
		if len(parents) == 0 {
			return fmt.Errorf("cannot amend initial commit")
		}
		// Get the parent of the commit we're amending
		_, data, err := objects.ReadObject(repoRoot, parents[0])
		if err != nil {
			return err
		}
		oldCommit, err := objects.ParseCommit(data)
		if err != nil {
			return err
		}
		parents = oldCommit.Parents

		// Use old message if no new one provided
		if message == "" {
			message = oldCommit.Message
		}
	} else {
		// Check if there are changes since last commit
		if len(parents) > 0 {
			changed, err := hasChanges(repoRoot, idx, parents[0])
			if err != nil {
				return err
			}
			if !changed {
				return fmt.Errorf("nothing to commit, working tree clean")
			}
		}
	}

	// Build tree from index
	treeSHA, err := buildTreeFromIndex(repoRoot, idx)
	if err != nil {
		return err
	}

	// Get author/committer info
	authorName := os.Getenv("GIT_AUTHOR_NAME")
	if authorName == "" {
		authorName = "Unknown"
	}
	authorEmail := os.Getenv("GIT_AUTHOR_EMAIL")
	if authorEmail == "" {
		authorEmail = "unknown@example.com"
	}
	committerName := os.Getenv("GIT_COMMITTER_NAME")
	if committerName == "" {
		committerName = authorName
	}
	committerEmail := os.Getenv("GIT_COMMITTER_EMAIL")
	if committerEmail == "" {
		committerEmail = authorEmail
	}

	// Get timestamp
	timestamp := time.Now()
	authorDate := os.Getenv("GIT_AUTHOR_DATE")
	if authorDate != "" {
		if t, err := time.Parse(time.RFC3339, authorDate); err == nil {
			timestamp = t
		}
	}

	committerTime := timestamp
	committerDate := os.Getenv("GIT_COMMITTER_DATE")
	if committerDate != "" {
		if t, err := time.Parse(time.RFC3339, committerDate); err == nil {
			committerTime = t
		}
	}

	// Format author/committer strings
	_, tzOffset := timestamp.Zone()
	tzHours := tzOffset / 3600
	tzMins := (tzOffset % 3600) / 60
	if tzMins < 0 {
		tzMins = -tzMins
	}
	tzStr := fmt.Sprintf("%+03d%02d", tzHours, tzMins)

	author := fmt.Sprintf("%s <%s> %d %s", authorName, authorEmail, timestamp.Unix(), tzStr)

	_, tzOffset = committerTime.Zone()
	tzHours = tzOffset / 3600
	tzMins = (tzOffset % 3600) / 60
	if tzMins < 0 {
		tzMins = -tzMins
	}
	tzStr = fmt.Sprintf("%+03d%02d", tzHours, tzMins)

	committer := fmt.Sprintf("%s <%s> %d %s", committerName, committerEmail, committerTime.Unix(), tzStr)

	// Create commit
	commit := &objects.Commit{
		Tree:      treeSHA,
		Parents:   parents,
		Author:    author,
		Committer: committer,
		Message:   message,
	}

	commitSHA, err := objects.WriteCommit(repoRoot, commit)
	if err != nil {
		return err
	}

	// Update HEAD
	currentBranch, err := refs.GetCurrentBranch(repoRoot)
	if err != nil {
		return err
	}

	if currentBranch != "" {
		// Update branch ref
		err = refs.UpdateRef(repoRoot, filepath.Join("refs", "heads", currentBranch), commitSHA)
	} else {
		// Detached HEAD
		err = refs.SetHEAD(repoRoot, commitSHA)
	}
	if err != nil {
		return err
	}

	// Print output
	firstLine := strings.SplitN(message, "\n", 2)[0]
	if len(firstLine) > 50 {
		firstLine = firstLine[:47] + "..."
	}

	branchInfo := currentBranch
	if branchInfo == "" {
		branchInfo = "HEAD detached"
	}
	if amend {
		branchInfo = branchInfo + " (amended)"
	} else if len(parents) == 0 {
		branchInfo = branchInfo + " (root-commit)"
	}

	fmt.Printf("[%s %s] %s\n", branchInfo, commitSHA[:7], firstLine)

	return nil
}

type treeNode struct {
	entries  []objects.TreeEntry
	children map[string]*treeNode
}

func buildTreeFromIndex(repoRoot string, idx *index.Index) (string, error) {
	root := &treeNode{children: make(map[string]*treeNode)}

	// Sort entries by name
	entries := idx.GetSortedEntries()

	for _, entry := range entries {
		parts := utils.SplitPath(entry.Name)
		current := root

		// Navigate/create directories
		for i := 0; i < len(parts)-1; i++ {
			dir := parts[i]
			if current.children[dir] == nil {
				current.children[dir] = &treeNode{children: make(map[string]*treeNode)}
			}
			current = current.children[dir]
		}

		// Add file entry
		fileName := parts[len(parts)-1]
		current.entries = append(current.entries, objects.TreeEntry{
			Mode: entry.Mode,
			Name: fileName,
			SHA:  entry.SHA,
		})
	}

	// Recursively build trees
	return buildTreeNode(repoRoot, root)
}

func buildTreeNode(repoRoot string, n *treeNode) (string, error) {
	var entries []objects.TreeEntry

	// Process subdirectories first
	var childNames []string
	for name := range n.children {
		childNames = append(childNames, name)
	}
	sort.Strings(childNames)

	for _, name := range childNames {
		child := n.children[name]
		childSHA, err := buildTreeNode(repoRoot, child)
		if err != nil {
			return "", err
		}
		entries = append(entries, objects.TreeEntry{
			Mode: 0040000,
			Name: name,
			SHA:  childSHA,
		})
	}

	// Add file entries
	entries = append(entries, n.entries...)

	return objects.WriteTree(repoRoot, entries)
}

func hasChanges(repoRoot string, idx *index.Index, parentSHA string) (bool, error) {
	// Get parent tree
	_, data, err := objects.ReadObject(repoRoot, parentSHA)
	if err != nil {
		return true, nil // Assume changes if can't read parent
	}

	commit, err := objects.ParseCommit(data)
	if err != nil {
		return true, nil
	}

	// Build current tree SHA
	currentTreeSHA, err := buildTreeFromIndex(repoRoot, idx)
	if err != nil {
		return true, nil
	}

	// Compare tree SHAs
	return currentTreeSHA != commit.Tree, nil
}

func autoStageTracked(repoRoot string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Update all tracked files
	for name, entry := range idx.Entries {
		absPath := filepath.Join(repoRoot, name)

		// Check if file still exists
		info, err := os.Stat(absPath)
		if os.IsNotExist(err) {
			// File deleted, remove from index
			idx.RemoveEntry(name)
			continue
		}
		if err != nil {
			continue
		}

		// Read content
		content, err := utils.ReadFile(absPath)
		if err != nil {
			continue
		}

		// Check if modified
		sha, err := objects.HashObject(repoRoot, objects.BlobType, content, false)
		if err != nil {
			continue
		}

		if sha != entry.SHA {
			// File modified, update
			newSHA, err := objects.WriteBlob(repoRoot, content)
			if err != nil {
				continue
			}

			mode, _ := utils.GetFileMode(absPath)
			idx.AddEntry(name, newSHA, mode, info)
		}
	}

	return index.WriteIndex(repoRoot, idx)
}
