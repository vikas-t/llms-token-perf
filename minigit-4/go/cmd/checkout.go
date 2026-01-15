package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
)

// Checkout switches branches or restores files
func Checkout(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	createBranch := false
	var target string
	var paths []string
	seenDashes := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-b":
			createBranch = true
		case "--":
			seenDashes = true
		default:
			if seenDashes {
				paths = append(paths, args[i])
			} else if strings.HasPrefix(args[i], "-") {
				continue
			} else if target == "" {
				target = args[i]
			} else {
				// Could be a path or start point for -b
				if createBranch && len(paths) == 0 {
					// This is the start point for -b
					paths = append(paths, args[i])
				} else {
					paths = append(paths, args[i])
				}
			}
		}
	}

	// If we saw "--" but no target before it, we're restoring files from index
	if seenDashes && target == "" && len(paths) > 0 {
		return checkoutFilesFromIndex(repoRoot, paths)
	}

	if target == "" {
		return fmt.Errorf("no target specified")
	}

	// Checkout file(s) from index or commit
	if seenDashes || (len(paths) > 0 && !createBranch) {
		return checkoutFiles(repoRoot, target, paths)
	}

	// Create and checkout new branch
	if createBranch {
		startPoint := "HEAD"
		if len(paths) > 0 {
			startPoint = paths[0]
		}
		return checkoutNewBranch(repoRoot, target, startPoint)
	}

	// Checkout existing branch or commit
	return checkoutRef(repoRoot, target)
}

func checkoutFilesFromIndex(repoRoot string, paths []string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	for _, p := range paths {
		if err := restoreFromIndex(repoRoot, idx, p); err != nil {
			return err
		}
	}
	return nil
}

func checkoutFiles(repoRoot, ref string, paths []string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// If ref is "--", restore from index
	if ref == "--" || ref == "" {
		for _, p := range paths {
			if err := restoreFromIndex(repoRoot, idx, p); err != nil {
				return err
			}
		}
		return nil
	}

	// Check if ref is a commit
	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		// Maybe ref is actually a file path
		paths = append([]string{ref}, paths...)
		for _, p := range paths {
			if err := restoreFromIndex(repoRoot, idx, p); err != nil {
				return err
			}
		}
		return nil
	}

	// Restore from commit
	treeFiles, err := getCommitTreeFiles(repoRoot, sha)
	if err != nil {
		return err
	}

	for _, p := range paths {
		if err := restoreFromTree(repoRoot, treeFiles, p); err != nil {
			return err
		}
	}

	return nil
}

func restoreFromIndex(repoRoot string, idx *index.Index, path string) error {
	entry := idx.GetEntry(path)
	if entry == nil {
		return fmt.Errorf("pathspec '%s' did not match any file(s) known to minigit", path)
	}

	// Read blob content
	_, data, err := objects.ReadObject(repoRoot, entry.SHA)
	if err != nil {
		return err
	}

	// Write to working tree
	absPath := filepath.Join(repoRoot, path)
	if err := utils.WriteFile(absPath, data, os.FileMode(entry.Mode&0777)); err != nil {
		return err
	}

	return nil
}

func restoreFromTree(repoRoot string, treeFiles map[string]string, path string) error {
	sha, ok := treeFiles[path]
	if !ok {
		return fmt.Errorf("pathspec '%s' did not match any file(s)", path)
	}

	// Read blob content
	_, data, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	// Write to working tree
	absPath := filepath.Join(repoRoot, path)
	if err := utils.WriteFile(absPath, data, 0644); err != nil {
		return err
	}

	return nil
}

func checkoutNewBranch(repoRoot, name, startPoint string) error {
	// Validate branch name
	if !isValidBranchName(name) {
		return fmt.Errorf("invalid branch name: %s", name)
	}

	// Check if branch already exists
	branches, _ := refs.ListBranches(repoRoot)
	for _, b := range branches {
		if b == name {
			return fmt.Errorf("branch '%s' already exists", name)
		}
	}

	// Resolve start point
	sha, err := refs.ResolveRef(repoRoot, startPoint)
	if err != nil {
		return fmt.Errorf("not a valid start point: %s", startPoint)
	}

	// Create branch
	if err := refs.CreateBranch(repoRoot, name, sha); err != nil {
		return err
	}

	// Update HEAD
	if err := refs.SetSymbolicRef(repoRoot, "HEAD", "refs/heads/"+name); err != nil {
		return err
	}

	// Update working tree
	return updateWorkingTree(repoRoot, sha)
}

func checkoutRef(repoRoot, target string) error {
	// Try as branch first
	branches, _ := refs.ListBranches(repoRoot)
	for _, b := range branches {
		if b == target {
			return checkoutBranch(repoRoot, target)
		}
	}

	// Try as SHA/ref
	sha, err := refs.ResolveRef(repoRoot, target)
	if err != nil {
		return fmt.Errorf("pathspec '%s' did not match any file(s) known to minigit", target)
	}

	// Verify it's a commit
	objType, _, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	if objType != objects.CommitType {
		return fmt.Errorf("not a commit: %s", target)
	}

	// Check for uncommitted changes
	if err := checkForConflicts(repoRoot, sha); err != nil {
		return err
	}

	// Detached HEAD
	if err := refs.SetHEAD(repoRoot, sha); err != nil {
		return err
	}

	// Update working tree
	if err := updateWorkingTree(repoRoot, sha); err != nil {
		return err
	}

	fmt.Printf("Note: switching to '%s'.\n", sha[:7])
	fmt.Println("You are in 'detached HEAD' state.")
	return nil
}

func checkoutBranch(repoRoot, name string) error {
	sha, err := refs.GetBranchSHA(repoRoot, name)
	if err != nil {
		return err
	}

	// Check for uncommitted changes
	if err := checkForConflicts(repoRoot, sha); err != nil {
		return err
	}

	// Update HEAD
	if err := refs.SetSymbolicRef(repoRoot, "HEAD", "refs/heads/"+name); err != nil {
		return err
	}

	// Update working tree
	if err := updateWorkingTree(repoRoot, sha); err != nil {
		return err
	}

	fmt.Printf("Switched to branch '%s'\n", name)
	return nil
}

func checkForConflicts(repoRoot, targetSHA string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Get target tree
	targetTree, err := getCommitTreeFiles(repoRoot, targetSHA)
	if err != nil {
		return err
	}

	// Check for modified files that would be overwritten
	for name, entry := range idx.Entries {
		absPath := filepath.Join(repoRoot, name)

		// Check if file exists and is modified
		if !utils.FileExists(absPath) {
			continue
		}

		content, err := utils.ReadFile(absPath)
		if err != nil {
			continue
		}

		currentSHA, _ := objects.HashObject(repoRoot, objects.BlobType, content, false)

		// If working tree differs from index
		if currentSHA != entry.SHA {
			// And target would change the file
			targetFileSHA := targetTree[name]
			if targetFileSHA != "" && targetFileSHA != entry.SHA {
				return fmt.Errorf("error: Your local changes to the following files would be overwritten by checkout:\n\t%s\nPlease commit your changes or stash them before you switch branches.", name)
			}
		}
	}

	return nil
}

func updateWorkingTree(repoRoot, commitSHA string) error {
	// Get current working tree files
	currentFiles := make(map[string]bool)
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
			currentFiles[rel] = true
		}
		return nil
	})

	// Get target tree
	targetTree, err := getCommitTreeFiles(repoRoot, commitSHA)
	if err != nil {
		return err
	}

	// Read index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		idx = index.NewIndex()
	}

	// Get index files for comparison
	indexFiles := make(map[string]string)
	for name, entry := range idx.Entries {
		indexFiles[name] = entry.SHA
	}

	// Remove files that are in index but not in target (and not modified)
	for name := range indexFiles {
		if _, inTarget := targetTree[name]; !inTarget {
			absPath := filepath.Join(repoRoot, name)
			if utils.FileExists(absPath) {
				// Check if modified
				content, err := utils.ReadFile(absPath)
				if err == nil {
					sha, _ := objects.HashObject(repoRoot, objects.BlobType, content, false)
					if sha == indexFiles[name] {
						// Not modified, safe to remove
						os.Remove(absPath)
						// Remove empty parent directories
						dir := filepath.Dir(absPath)
						for dir != repoRoot {
							entries, _ := os.ReadDir(dir)
							if len(entries) == 0 {
								os.Remove(dir)
							}
							dir = filepath.Dir(dir)
						}
					}
				}
			}
		}
	}

	// Update index and working tree with target files
	newIndex := index.NewIndex()

	for name, sha := range targetTree {
		// Read blob content
		_, data, err := objects.ReadObject(repoRoot, sha)
		if err != nil {
			continue
		}

		// Write to working tree
		absPath := filepath.Join(repoRoot, name)
		if err := utils.WriteFile(absPath, data, 0644); err != nil {
			continue
		}

		// Update index
		info, _ := os.Stat(absPath)
		newIndex.AddEntry(name, sha, 0100644, info)
	}

	return index.WriteIndex(repoRoot, newIndex)
}
