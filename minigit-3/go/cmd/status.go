package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Status shows working tree status
func Status(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	shortFormat := false
	porcelain := false
	for _, arg := range args {
		switch arg {
		case "-s", "--short":
			shortFormat = true
		case "--porcelain":
			porcelain = true
			shortFormat = true
		}
	}

	// Read index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Get HEAD tree files
	var headFiles map[string]string
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err == nil {
		headTree, err := getTreeFromCommit(repoRoot, headSHA)
		if err == nil {
			headFiles, _ = flattenTreeToFiles(repoRoot, headTree, "")
		}
	}
	if headFiles == nil {
		headFiles = make(map[string]string)
	}

	// Get index files
	indexFiles := make(map[string]string)
	indexModes := make(map[string]uint32)
	for _, entry := range idx.Entries {
		indexFiles[entry.Name] = entry.GetSHAHex()
		indexModes[entry.Name] = entry.Mode
	}

	// Track changes
	stagedNew := []string{}
	stagedModified := []string{}
	stagedDeleted := []string{}
	unstagedModified := []string{}
	unstagedDeleted := []string{}
	untracked := []string{}

	// Compare HEAD to index (staged changes)
	for path, sha := range indexFiles {
		if headSHA, ok := headFiles[path]; !ok {
			stagedNew = append(stagedNew, path)
		} else if sha != headSHA {
			stagedModified = append(stagedModified, path)
		}
	}

	for path := range headFiles {
		if _, ok := indexFiles[path]; !ok {
			stagedDeleted = append(stagedDeleted, path)
		}
	}

	// Compare index to working tree
	allPaths := make(map[string]bool)
	for p := range indexFiles {
		allPaths[p] = true
	}

	// Walk working tree
	filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip .minigit directory
		if info.IsDir() {
			if info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := utils.RelativePath(repoRoot, path)
		if err != nil {
			return nil
		}

		allPaths[relPath] = true
		return nil
	})

	// Check each path
	for path := range allPaths {
		fullPath := filepath.Join(repoRoot, path)
		info, statErr := os.Stat(fullPath)

		indexSHA, inIndex := indexFiles[path]

		if statErr != nil {
			if os.IsNotExist(statErr) && inIndex {
				unstagedDeleted = append(unstagedDeleted, path)
			}
			continue
		}

		if !inIndex {
			// Untracked file
			untracked = append(untracked, path)
			continue
		}

		// Check if modified
		content, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		workingSHA := utils.HashObject("blob", content)
		if workingSHA != indexSHA {
			unstagedModified = append(unstagedModified, path)
		}

		// Check mode changes
		_ = info // TODO: check mode changes
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

	return printLongStatus(repoRoot, stagedNew, stagedModified, stagedDeleted,
		unstagedModified, unstagedDeleted, untracked)
}

func printShortStatus(stagedNew, stagedModified, stagedDeleted,
	unstagedModified, unstagedDeleted, untracked []string) error {

	// Short format: XY filename
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

func printLongStatus(repoRoot string, stagedNew, stagedModified, stagedDeleted,
	unstagedModified, unstagedDeleted, untracked []string) error {

	// Print branch info
	branch, err := refs.GetCurrentBranch(repoRoot)
	if err == nil && branch != "" {
		fmt.Printf("On branch %s\n", branch)
	} else {
		headSHA, err := refs.ResolveHEAD(repoRoot)
		if err == nil {
			fmt.Printf("HEAD detached at %s\n", headSHA[:7])
		}
	}

	hasStaged := len(stagedNew) > 0 || len(stagedModified) > 0 || len(stagedDeleted) > 0
	hasUnstaged := len(unstagedModified) > 0 || len(unstagedDeleted) > 0
	hasUntracked := len(untracked) > 0

	if !hasStaged && !hasUnstaged && !hasUntracked {
		fmt.Println("nothing to commit, working tree clean")
		return nil
	}

	// Staged changes
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

	// Unstaged changes
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

	// Untracked files
	if hasUntracked {
		fmt.Println("\nUntracked files:")
		fmt.Println("  (use \"minigit add <file>...\" to include in what will be committed)")
		fmt.Println()

		for _, path := range untracked {
			fmt.Printf("\t%s\n", path)
		}
	}

	fmt.Println()
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

// getWorkingTreeFiles returns all files in working tree
func getWorkingTreeFiles(repoRoot string) (map[string]bool, error) {
	files := make(map[string]bool)

	err := filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			if info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil
		}

		// Use forward slashes
		relPath = strings.ReplaceAll(relPath, string(filepath.Separator), "/")
		files[relPath] = true
		return nil
	})

	return files, err
}
