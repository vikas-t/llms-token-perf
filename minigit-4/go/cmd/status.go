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
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	short := false
	porcelain := false
	for _, arg := range args {
		switch arg {
		case "--short", "-s":
			short = true
		case "--porcelain":
			porcelain = true
			short = true
		}
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Get HEAD tree
	var headTree map[string]string // path -> SHA
	headSHA, err := refs.ResolveRef(repoRoot, "HEAD")
	if err == nil && headSHA != "" {
		headTree, err = getTreeFiles(repoRoot, headSHA)
		if err != nil {
			headTree = make(map[string]string)
		}
	} else {
		headTree = make(map[string]string)
	}

	// Get index files
	indexFiles := make(map[string]*index.IndexEntry)
	for name, entry := range idx.Entries {
		indexFiles[name] = entry
	}

	// Get working tree files
	workingTree := make(map[string]bool)
	filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if !strings.HasPrefix(rel, ".minigit") {
			workingTree[rel] = true
		}
		return nil
	})

	// Categorize changes
	var stagedNew, stagedModified, stagedDeleted []string
	var unstagedModified, unstagedDeleted []string
	var untracked []string

	// Check staged changes (index vs HEAD)
	for name, entry := range indexFiles {
		headSHA, inHead := headTree[name]
		if !inHead {
			stagedNew = append(stagedNew, name)
		} else if headSHA != entry.SHA {
			stagedModified = append(stagedModified, name)
		}
	}

	// Check for staged deletions (in HEAD but not in index)
	for name := range headTree {
		if _, inIndex := indexFiles[name]; !inIndex {
			stagedDeleted = append(stagedDeleted, name)
		}
	}

	// Check working tree changes (working tree vs index)
	for name, entry := range indexFiles {
		absPath := filepath.Join(repoRoot, name)
		if _, exists := workingTree[name]; !exists {
			unstagedDeleted = append(unstagedDeleted, name)
		} else {
			// Check if modified
			content, err := utils.ReadFile(absPath)
			if err != nil {
				continue
			}
			sha, err := objects.HashObject(repoRoot, objects.BlobType, content, false)
			if err != nil {
				continue
			}
			if sha != entry.SHA {
				unstagedModified = append(unstagedModified, name)
			}
		}
	}

	// Find untracked files
	for name := range workingTree {
		if _, inIndex := indexFiles[name]; !inIndex {
			untracked = append(untracked, name)
		}
	}

	// Sort all lists
	sort.Strings(stagedNew)
	sort.Strings(stagedModified)
	sort.Strings(stagedDeleted)
	sort.Strings(unstagedModified)
	sort.Strings(unstagedDeleted)
	sort.Strings(untracked)

	if short || porcelain {
		printShortStatus(stagedNew, stagedModified, stagedDeleted, unstagedModified, unstagedDeleted, untracked)
	} else {
		printLongStatus(repoRoot, stagedNew, stagedModified, stagedDeleted, unstagedModified, unstagedDeleted, untracked)
	}

	return nil
}

func getTreeFiles(repoRoot, commitSHA string) (map[string]string, error) {
	files := make(map[string]string)

	// Get commit
	_, data, err := objects.ReadObject(repoRoot, commitSHA)
	if err != nil {
		return files, err
	}

	commit, err := objects.ParseCommit(data)
	if err != nil {
		return files, err
	}

	// Walk tree
	return walkTree(repoRoot, commit.Tree, "")
}

func walkTree(repoRoot, treeSHA, prefix string) (map[string]string, error) {
	files := make(map[string]string)

	_, data, err := objects.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return files, err
	}

	entries, err := objects.ParseTree(data)
	if err != nil {
		return files, err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		if entry.Mode == 0040000 {
			// Directory, recurse
			subFiles, err := walkTree(repoRoot, entry.SHA, path)
			if err != nil {
				continue
			}
			for k, v := range subFiles {
				files[k] = v
			}
		} else {
			files[path] = entry.SHA
		}
	}

	return files, nil
}

func printShortStatus(stagedNew, stagedModified, stagedDeleted, unstagedModified, unstagedDeleted, untracked []string) {
	// Format: XY filename where X = index status, Y = working tree status
	for _, f := range stagedNew {
		// Check if also modified in working tree
		y := " "
		fmt.Printf("A%s %s\n", y, f)
	}
	for _, f := range stagedModified {
		y := " "
		fmt.Printf("M%s %s\n", y, f)
	}
	for _, f := range stagedDeleted {
		fmt.Printf("D  %s\n", f)
	}
	for _, f := range unstagedModified {
		// Check if also staged
		fmt.Printf(" M %s\n", f)
	}
	for _, f := range unstagedDeleted {
		fmt.Printf(" D %s\n", f)
	}
	for _, f := range untracked {
		fmt.Printf("?? %s\n", f)
	}
}

func printLongStatus(repoRoot string, stagedNew, stagedModified, stagedDeleted, unstagedModified, unstagedDeleted, untracked []string) {
	// Get current branch
	branch, err := refs.GetCurrentBranch(repoRoot)
	if err != nil || branch == "" {
		// Check if detached
		detached, _ := refs.IsDetachedHEAD(repoRoot)
		if detached {
			fmt.Println("HEAD detached")
		}
	} else {
		fmt.Printf("On branch %s\n", branch)
	}

	hasStaged := len(stagedNew)+len(stagedModified)+len(stagedDeleted) > 0
	hasUnstaged := len(unstagedModified)+len(unstagedDeleted) > 0
	hasUntracked := len(untracked) > 0

	if hasStaged {
		fmt.Println("\nChanges to be committed:")
		fmt.Println("  (use \"minigit restore --staged <file>...\" to unstage)")
		fmt.Println()
		for _, f := range stagedNew {
			fmt.Printf("\tnew file:   %s\n", f)
		}
		for _, f := range stagedModified {
			fmt.Printf("\tmodified:   %s\n", f)
		}
		for _, f := range stagedDeleted {
			fmt.Printf("\tdeleted:    %s\n", f)
		}
	}

	if hasUnstaged {
		fmt.Println("\nChanges not staged for commit:")
		fmt.Println("  (use \"minigit add <file>...\" to update what will be committed)")
		fmt.Println()
		for _, f := range unstagedModified {
			fmt.Printf("\tmodified:   %s\n", f)
		}
		for _, f := range unstagedDeleted {
			fmt.Printf("\tdeleted:    %s\n", f)
		}
	}

	if hasUntracked {
		fmt.Println("\nUntracked files:")
		fmt.Println("  (use \"minigit add <file>...\" to include in what will be committed)")
		fmt.Println()
		for _, f := range untracked {
			fmt.Printf("\t%s\n", f)
		}
	}

	if !hasStaged && !hasUnstaged && !hasUntracked {
		fmt.Println("\nnothing to commit, working tree clean")
	}
}
