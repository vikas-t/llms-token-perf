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
	amend := false
	autoStage := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-m":
			if i+1 >= len(args) {
				return fmt.Errorf("option requires an argument -- 'm'")
			}
			i++
			message = args[i]
		case "--amend":
			amend = true
		case "-a":
			autoStage = true
		default:
			if strings.HasPrefix(args[i], "-m") {
				message = strings.TrimPrefix(args[i], "-m")
			}
		}
	}

	// Auto-stage modified files if -a flag
	if autoStage {
		if err := autoStageModified(repoRoot); err != nil {
			return err
		}
	}

	// Read index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	if len(idx.Entries) == 0 && !amend {
		return fmt.Errorf("nothing to commit")
	}

	// Get current HEAD
	var parents []string
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err == nil {
		parents = append(parents, headSHA)
	}

	// For amend, use parent of HEAD
	if amend && len(parents) > 0 {
		objType, content, err := utils.ReadObject(repoRoot, headSHA)
		if err != nil {
			return err
		}
		if objType != "commit" {
			return fmt.Errorf("HEAD is not a commit")
		}
		commit, err := objects.ParseCommit(content)
		if err != nil {
			return err
		}
		parents = commit.Parents

		// If no message provided, use the original message
		if message == "" {
			message = strings.TrimSpace(commit.Message)
		}
	}

	if message == "" {
		return fmt.Errorf("Aborting commit due to empty commit message")
	}

	// Check for changes (unless amend)
	if !amend && len(parents) > 0 {
		parentTree, err := getTreeFromCommit(repoRoot, parents[0])
		if err == nil {
			newTree := buildTreeFromIndex(repoRoot, idx)
			if newTree == parentTree {
				return fmt.Errorf("nothing to commit, working tree clean")
			}
		}
	}

	// Build tree from index
	treeSHA, err := buildTreeObjectFromIndex(repoRoot, idx)
	if err != nil {
		return err
	}

	// Get author/committer info
	authorName := utils.GetEnvOrDefault("GIT_AUTHOR_NAME", "Unknown")
	authorEmail := utils.GetEnvOrDefault("GIT_AUTHOR_EMAIL", "unknown@example.com")
	committerName := utils.GetEnvOrDefault("GIT_COMMITTER_NAME", authorName)
	committerEmail := utils.GetEnvOrDefault("GIT_COMMITTER_EMAIL", authorEmail)

	// Parse dates
	authorDate := parseGitDate(os.Getenv("GIT_AUTHOR_DATE"))
	committerDate := parseGitDate(os.Getenv("GIT_COMMITTER_DATE"))

	author := objects.FormatAuthor(authorName, authorEmail, authorDate)
	committer := objects.FormatAuthor(committerName, committerEmail, committerDate)

	// Create commit object
	commitSHA, err := objects.CreateCommit(repoRoot, treeSHA, parents, message, author, committer)
	if err != nil {
		return err
	}

	// Update branch ref
	branch, err := refs.GetCurrentBranch(repoRoot)
	if err == nil && branch != "" {
		if err := refs.UpdateRef(repoRoot, "refs/heads/"+branch, commitSHA); err != nil {
			return err
		}
	} else {
		// Detached HEAD
		if err := refs.UpdateHEAD(repoRoot, commitSHA, false); err != nil {
			return err
		}
	}

	// Output
	shortSHA := commitSHA[:7]
	branchInfo := ""
	if branch != "" {
		branchInfo = branch + " "
	} else {
		branchInfo = "(detached HEAD) "
	}

	if len(parents) == 0 {
		fmt.Printf("[%s(root-commit) %s] %s\n", branchInfo, shortSHA, firstLine(message))
	} else {
		fmt.Printf("[%s%s] %s\n", branchInfo, shortSHA, firstLine(message))
	}

	return nil
}

func parseGitDate(dateStr string) time.Time {
	if dateStr == "" {
		return time.Now()
	}

	// Try various formats
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05Z",
		"Mon Jan 2 15:04:05 2006 -0700",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t
		}
	}

	return time.Now()
}

func firstLine(s string) string {
	if idx := strings.Index(s, "\n"); idx != -1 {
		return s[:idx]
	}
	return s
}

func buildTreeFromIndex(repoRoot string, idx *index.Index) string {
	treeSHA, _ := buildTreeObjectFromIndex(repoRoot, idx)
	return treeSHA
}

func buildTreeObjectFromIndex(repoRoot string, idx *index.Index) (string, error) {
	// Group entries by directory
	type dirEntry struct {
		name    string
		mode    string
		sha     string
		isDir   bool
		entries []dirEntry
	}

	root := make(map[string]interface{})

	for _, entry := range idx.Entries {
		parts := strings.Split(entry.Name, "/")
		current := root

		for i, part := range parts {
			if i == len(parts)-1 {
				// Leaf entry
				mode := fmt.Sprintf("%o", entry.Mode)
				current[part] = objects.TreeEntry{
					Mode: mode,
					Name: part,
					SHA:  entry.GetSHAHex(),
				}
			} else {
				// Directory
				if _, ok := current[part]; !ok {
					current[part] = make(map[string]interface{})
				}
				current = current[part].(map[string]interface{})
			}
		}
	}

	return buildTreeRecursive(repoRoot, root)
}

func buildTreeRecursive(repoRoot string, dir map[string]interface{}) (string, error) {
	var entries []objects.TreeEntry

	// Sort keys for deterministic output
	keys := make([]string, 0, len(dir))
	for k := range dir {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, name := range keys {
		v := dir[name]
		switch entry := v.(type) {
		case objects.TreeEntry:
			entries = append(entries, entry)
		case map[string]interface{}:
			// Subdirectory - recurse
			subTreeSHA, err := buildTreeRecursive(repoRoot, entry)
			if err != nil {
				return "", err
			}
			entries = append(entries, objects.TreeEntry{
				Mode: "40000",
				Name: name,
				SHA:  subTreeSHA,
			})
		}
	}

	return objects.CreateTree(repoRoot, entries)
}

func autoStageModified(repoRoot string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Check each indexed file for modifications
	for i := range idx.Entries {
		entry := &idx.Entries[i]
		fullPath := filepath.Join(repoRoot, entry.Name)

		info, err := os.Stat(fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				// File deleted - we don't auto-remove, just skip
				continue
			}
			return err
		}

		// Read and hash file
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return err
		}

		newSHA := utils.HashObject("blob", content)
		if newSHA != entry.GetSHAHex() {
			// File modified - update index
			sha, err := objects.CreateBlob(repoRoot, content)
			if err != nil {
				return err
			}
			entry.SetSHAFromHex(sha)
			entry.Size = uint32(info.Size())
		}
	}

	return idx.WriteIndex(repoRoot)
}
