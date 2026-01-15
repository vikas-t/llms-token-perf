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
)

// Commit creates a new commit
func Commit(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	var message string
	autoStage := false
	amend := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-m":
			if i+1 < len(args) {
				message = args[i+1]
				i++
			}
		case "-a":
			autoStage = true
		case "--amend":
			amend = true
		}
	}

	if message == "" && !amend {
		return fmt.Errorf("commit message required")
	}

	// Auto-stage modified tracked files if -a
	if autoStage {
		if err := autoStageTracked(gitDir, workTree); err != nil {
			return err
		}
	}

	// Read index
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	if len(idx.Entries) == 0 {
		return fmt.Errorf("nothing to commit")
	}

	// Get current HEAD
	var parents []string
	var headCommit *objects.Commit

	headSHA, err := refs.ResolveRef(gitDir, "HEAD")
	if err == nil && headSHA != "" {
		if amend {
			_, data, err := objects.ReadObject(gitDir, headSHA)
			if err != nil {
				return err
			}
			headCommit, err = objects.ParseCommit(data)
			if err != nil {
				return err
			}
			parents = headCommit.Parents
			if message == "" {
				message = headCommit.Message
			}
		} else {
			parents = []string{headSHA}
		}
	}

	// Check if there are changes
	if !amend {
		hasChanges, err := checkForChanges(gitDir, idx, headSHA)
		if err != nil {
			return err
		}
		if !hasChanges {
			return fmt.Errorf("nothing to commit, working tree clean")
		}
	}

	// Build tree from index
	treeSHA, err := buildTreeFromIndex(gitDir, idx)
	if err != nil {
		return err
	}

	// Create commit
	author := objects.GetAuthorString("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE")
	committer := objects.GetAuthorString("GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE")

	commitData := objects.BuildCommit(treeSHA, parents, author, committer, message)
	commitSHA, err := objects.WriteObject(gitDir, objects.TypeCommit, commitData)
	if err != nil {
		return err
	}

	// Update current branch
	if err := refs.UpdateCurrentBranch(gitDir, commitSHA); err != nil {
		return err
	}

	// Get branch name for output
	branch, _ := refs.GetCurrentBranch(gitDir)
	if branch == "" {
		branch = "HEAD detached"
	}

	firstLine := strings.Split(message, "\n")[0]
	if len(firstLine) > 50 {
		firstLine = firstLine[:47] + "..."
	}

	fmt.Printf("[%s %s] %s\n", branch, commitSHA[:7], firstLine)
	return nil
}

func autoStageTracked(gitDir, workTree string) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get tracked files from HEAD
	trackedFiles := make(map[string]bool)
	headSHA, err := refs.ResolveRef(gitDir, "HEAD")
	if err == nil && headSHA != "" {
		treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, headSHA)
		if err == nil {
			files, _ := objects.ReadTreeRecursive(gitDir, treeSHA, "")
			for path := range files {
				trackedFiles[path] = true
			}
		}
	}

	// Also include files currently in index
	for _, entry := range idx.Entries {
		trackedFiles[entry.Name] = true
	}

	// Update entries for modified tracked files
	for path := range trackedFiles {
		fullPath := filepath.Join(workTree, path)
		info, err := os.Stat(fullPath)
		if err != nil {
			// File might be deleted
			continue
		}

		content, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		sha, err := objects.WriteObject(gitDir, objects.TypeBlob, content)
		if err != nil {
			continue
		}

		entry := index.CreateEntryFromFile(path, sha, info)
		idx.AddEntry(entry)
	}

	return index.WriteIndex(gitDir, idx)
}

func checkForChanges(gitDir string, idx *index.Index, headSHA string) (bool, error) {
	if headSHA == "" {
		return len(idx.Entries) > 0, nil
	}

	treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, headSHA)
	if err != nil {
		return false, err
	}

	headFiles, err := objects.ReadTreeRecursive(gitDir, treeSHA, "")
	if err != nil {
		return false, err
	}

	// Compare index with HEAD
	indexFiles := make(map[string]string)
	for _, entry := range idx.Entries {
		indexFiles[entry.Name] = entry.SHA
	}

	// Check for differences
	if len(indexFiles) != len(headFiles) {
		return true, nil
	}

	for path, sha := range indexFiles {
		if headFiles[path] != sha {
			return true, nil
		}
	}

	return false, nil
}

type treeBuilder struct {
	entries map[string]objects.TreeEntry
	subdirs map[string]*treeBuilder
}

func buildTreeFromIndex(gitDir string, idx *index.Index) (string, error) {
	// Group entries by directory
	root := &treeBuilder{
		entries: make(map[string]objects.TreeEntry),
		subdirs: make(map[string]*treeBuilder),
	}

	for _, entry := range idx.Entries {
		parts := strings.Split(entry.Name, "/")
		current := root

		for i, part := range parts {
			if i == len(parts)-1 {
				// File entry
				mode := fmt.Sprintf("%o", entry.Mode)
				current.entries[part] = objects.TreeEntry{
					Mode: mode,
					Name: part,
					SHA:  entry.SHA,
				}
			} else {
				// Directory
				if current.subdirs[part] == nil {
					current.subdirs[part] = &treeBuilder{
						entries: make(map[string]objects.TreeEntry),
						subdirs: make(map[string]*treeBuilder),
					}
				}
				current = current.subdirs[part]
			}
		}
	}

	// Build trees bottom-up
	return buildTree(gitDir, root)
}

func buildTree(gitDir string, tb *treeBuilder) (string, error) {
	var entries []objects.TreeEntry

	// Add file entries
	for _, entry := range tb.entries {
		entries = append(entries, entry)
	}

	// Build subdirectory trees
	for name, subdir := range tb.subdirs {
		sha, err := buildTree(gitDir, subdir)
		if err != nil {
			return "", err
		}
		entries = append(entries, objects.TreeEntry{
			Mode: "40000",
			Name: name,
			SHA:  sha,
		})
	}

	// Sort entries
	sort.Slice(entries, func(i, j int) bool {
		// Git sorts with trailing / for directories
		nameI := entries[i].Name
		nameJ := entries[j].Name
		if entries[i].Mode == "40000" {
			nameI += "/"
		}
		if entries[j].Mode == "40000" {
			nameJ += "/"
		}
		return nameI < nameJ
	})

	treeData := objects.BuildTree(entries)
	return objects.WriteObject(gitDir, objects.TypeTree, treeData)
}
