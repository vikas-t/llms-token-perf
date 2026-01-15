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

// Status shows working tree status
func Status(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	shortFormat := false
	porcelain := false

	for _, arg := range args {
		switch arg {
		case "--short", "-s":
			shortFormat = true
		case "--porcelain":
			porcelain = true
		}
	}

	// Read index
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get HEAD tree
	headFiles := make(map[string]string)
	headSHA, err := refs.ResolveRef(gitDir, "HEAD")
	if err == nil && headSHA != "" {
		treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, headSHA)
		if err == nil {
			headFiles, _ = objects.ReadTreeRecursive(gitDir, treeSHA, "")
		}
	}

	// Get index files
	indexFiles := make(map[string]string)
	for _, entry := range idx.Entries {
		indexFiles[entry.Name] = entry.SHA
	}

	// Get working tree files
	workFiles := make(map[string]bool)
	filepath.Walk(workTree, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}
		relPath, _ := filepath.Rel(workTree, path)
		relPath = utils.NormalizePath(relPath)
		if !strings.HasPrefix(relPath, ".") {
			workFiles[relPath] = true
		}
		return nil
	})

	// Categorize changes
	var stagedNew, stagedModified, stagedDeleted []string
	var unstagedModified, unstagedDeleted []string
	var untracked []string

	// Check staged changes (index vs HEAD)
	for path, sha := range indexFiles {
		if headSHA, ok := headFiles[path]; !ok {
			stagedNew = append(stagedNew, path)
		} else if headSHA != sha {
			stagedModified = append(stagedModified, path)
		}
	}

	for path := range headFiles {
		if _, ok := indexFiles[path]; !ok {
			stagedDeleted = append(stagedDeleted, path)
		}
	}

	// Check unstaged changes (working tree vs index)
	for path, sha := range indexFiles {
		fullPath := filepath.Join(workTree, path)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			unstagedDeleted = append(unstagedDeleted, path)
			continue
		}

		content, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		currentSHA := utils.HashObject("blob", content)
		if currentSHA != sha {
			unstagedModified = append(unstagedModified, path)
		}
	}

	// Check untracked files
	for path := range workFiles {
		if _, ok := indexFiles[path]; !ok {
			untracked = append(untracked, path)
		}
	}

	// Sort all lists
	sort.Strings(stagedNew)
	sort.Strings(stagedModified)
	sort.Strings(stagedDeleted)
	sort.Strings(unstagedModified)
	sort.Strings(unstagedDeleted)
	sort.Strings(untracked)

	if shortFormat || porcelain {
		return printShortStatus(stagedNew, stagedModified, stagedDeleted,
			unstagedModified, unstagedDeleted, untracked)
	}

	return printLongStatus(gitDir, stagedNew, stagedModified, stagedDeleted,
		unstagedModified, unstagedDeleted, untracked)
}

func printShortStatus(stagedNew, stagedModified, stagedDeleted,
	unstagedModified, unstagedDeleted, untracked []string) error {

	// Format: XY filename
	// X = index status, Y = worktree status

	for _, path := range stagedNew {
		if contains(unstagedModified, path) {
			fmt.Printf("AM %s\n", path)
		} else {
			fmt.Printf("A  %s\n", path)
		}
	}

	for _, path := range stagedModified {
		if contains(unstagedModified, path) {
			fmt.Printf("MM %s\n", path)
		} else {
			fmt.Printf("M  %s\n", path)
		}
	}

	for _, path := range stagedDeleted {
		fmt.Printf("D  %s\n", path)
	}

	for _, path := range unstagedModified {
		if !contains(stagedNew, path) && !contains(stagedModified, path) {
			fmt.Printf(" M %s\n", path)
		}
	}

	for _, path := range unstagedDeleted {
		if !contains(stagedDeleted, path) {
			fmt.Printf(" D %s\n", path)
		}
	}

	for _, path := range untracked {
		fmt.Printf("?? %s\n", path)
	}

	return nil
}

func printLongStatus(gitDir string, stagedNew, stagedModified, stagedDeleted,
	unstagedModified, unstagedDeleted, untracked []string) error {

	// Print branch info
	branch, err := refs.GetCurrentBranch(gitDir)
	if err == nil && branch != "" {
		fmt.Printf("On branch %s\n", branch)
	} else {
		head, _ := refs.ReadHEAD(gitDir)
		if !strings.HasPrefix(head, "ref:") {
			fmt.Printf("HEAD detached at %s\n", head[:7])
		}
	}

	hasStaged := len(stagedNew) > 0 || len(stagedModified) > 0 || len(stagedDeleted) > 0
	hasUnstaged := len(unstagedModified) > 0 || len(unstagedDeleted) > 0
	hasUntracked := len(untracked) > 0

	if hasStaged {
		fmt.Println("\nChanges to be committed:")
		fmt.Println("  (use \"minigit restore --staged <file>...\" to unstage)")
		fmt.Println()
		for _, path := range stagedNew {
			fmt.Printf("\tnew file:   %s\n", path)
		}
		for _, path := range stagedModified {
			fmt.Printf("\tmodified:   %s\n", path)
		}
		for _, path := range stagedDeleted {
			fmt.Printf("\tdeleted:    %s\n", path)
		}
	}

	if hasUnstaged {
		fmt.Println("\nChanges not staged for commit:")
		fmt.Println("  (use \"minigit add <file>...\" to update what will be committed)")
		fmt.Println()
		for _, path := range unstagedModified {
			fmt.Printf("\tmodified:   %s\n", path)
		}
		for _, path := range unstagedDeleted {
			fmt.Printf("\tdeleted:    %s\n", path)
		}
	}

	if hasUntracked {
		fmt.Println("\nUntracked files:")
		fmt.Println("  (use \"minigit add <file>...\" to include in what will be committed)")
		fmt.Println()
		for _, path := range untracked {
			fmt.Printf("\t%s\n", path)
		}
	}

	if !hasStaged && !hasUnstaged && !hasUntracked {
		fmt.Println("\nnothing to commit, working tree clean")
	}

	return nil
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
