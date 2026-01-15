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
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	createBranch := false
	var positionals []string
	var paths []string
	inPaths := false

	for i := 0; i < len(args); i++ {
		if args[i] == "--" {
			inPaths = true
			continue
		}
		if inPaths {
			paths = append(paths, args[i])
			continue
		}

		switch args[i] {
		case "-b":
			createBranch = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				positionals = append(positionals, args[i])
			}
		}
	}

	// For checkout -b, we need branch name and optional start point
	if createBranch {
		if len(positionals) == 0 {
			return fmt.Errorf("branch name required")
		}
		branchName := positionals[0]
		startPoint := "HEAD"
		if len(positionals) > 1 {
			startPoint = positionals[1]
		}
		return createAndCheckoutBranch(gitDir, workTree, branchName, startPoint)
	}

	// If we have paths after --, restore from index or commit
	if len(paths) > 0 {
		if len(positionals) == 0 {
			return restoreFromIndex(gitDir, workTree, paths)
		}
		return restoreFromCommit(gitDir, workTree, positionals[0], paths)
	}

	if len(positionals) == 0 {
		return fmt.Errorf("pathspec required")
	}

	target := positionals[0]

	// Try to checkout as branch first
	if refs.BranchExists(gitDir, target) {
		return checkoutBranch(gitDir, workTree, target)
	}

	// Try to checkout as SHA (detached HEAD)
	sha, err := refs.ResolveRef(gitDir, target)
	if err != nil {
		return fmt.Errorf("pathspec '%s' did not match any file(s) known to minigit", target)
	}

	return checkoutDetached(gitDir, workTree, sha)
}

func restoreFromIndex(gitDir, workTree string, paths []string) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	for _, path := range paths {
		entry := idx.GetEntry(path)
		if entry == nil {
			return fmt.Errorf("pathspec '%s' did not match any file(s)", path)
		}

		_, content, err := objects.ReadObject(gitDir, entry.SHA)
		if err != nil {
			return err
		}

		fullPath := filepath.Join(workTree, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return err
		}

		mode := os.FileMode(0644)
		if entry.Mode == 0100755 {
			mode = 0755
		}

		if err := os.WriteFile(fullPath, content, mode); err != nil {
			return err
		}
	}

	return nil
}

func restoreFromCommit(gitDir, workTree, ref string, paths []string) error {
	sha, err := refs.ResolveRef(gitDir, ref)
	if err != nil {
		return err
	}

	treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, sha)
	if err != nil {
		return err
	}

	files, err := objects.ReadTreeRecursive(gitDir, treeSHA, "")
	if err != nil {
		return err
	}

	for _, path := range paths {
		blobSHA, ok := files[path]
		if !ok {
			return fmt.Errorf("pathspec '%s' did not match any file(s)", path)
		}

		_, content, err := objects.ReadObject(gitDir, blobSHA)
		if err != nil {
			return err
		}

		fullPath := filepath.Join(workTree, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return err
		}

		if err := os.WriteFile(fullPath, content, 0644); err != nil {
			return err
		}

		// Also update index
		idx, err := index.ReadIndex(gitDir)
		if err == nil {
			info, _ := os.Stat(fullPath)
			if info != nil {
				entry := index.CreateEntryFromFile(path, blobSHA, info)
				idx.AddEntry(entry)
				index.WriteIndex(gitDir, idx)
			}
		}
	}

	return nil
}

func createAndCheckoutBranch(gitDir, workTree, name, startPoint string) error {
	if refs.BranchExists(gitDir, name) {
		return fmt.Errorf("branch '%s' already exists", name)
	}

	sha, err := refs.ResolveRef(gitDir, startPoint)
	if err != nil {
		return err
	}

	// Create branch
	if err := refs.WriteRef(gitDir, "refs/heads/"+name, sha); err != nil {
		return err
	}

	// Checkout
	return checkoutBranch(gitDir, workTree, name)
}

func checkoutBranch(gitDir, workTree, branch string) error {
	sha, err := refs.ResolveRef(gitDir, "refs/heads/"+branch)
	if err != nil {
		return err
	}

	// Check for uncommitted changes that would be overwritten
	if err := checkUncommittedChanges(gitDir, workTree, sha); err != nil {
		return err
	}

	// Update working tree
	if err := updateWorkTree(gitDir, workTree, sha); err != nil {
		return err
	}

	// Update HEAD
	if err := refs.SetSymbolicRef(gitDir, "HEAD", "refs/heads/"+branch); err != nil {
		return err
	}

	fmt.Printf("Switched to branch '%s'\n", branch)
	return nil
}

func checkoutDetached(gitDir, workTree, sha string) error {
	// Check for uncommitted changes
	if err := checkUncommittedChanges(gitDir, workTree, sha); err != nil {
		return err
	}

	// Update working tree
	if err := updateWorkTree(gitDir, workTree, sha); err != nil {
		return err
	}

	// Update HEAD to detached state
	if err := refs.WriteHEAD(gitDir, sha); err != nil {
		return err
	}

	fmt.Printf("HEAD is now at %s\n", sha[:7])
	return nil
}

func checkUncommittedChanges(gitDir, workTree, targetSHA string) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get target tree
	targetTree, err := objects.GetTreeSHAFromCommit(gitDir, targetSHA)
	if err != nil {
		return err
	}

	targetFiles, err := objects.ReadTreeRecursive(gitDir, targetTree, "")
	if err != nil {
		return err
	}

	// Check each file in index
	for _, entry := range idx.Entries {
		fullPath := filepath.Join(workTree, entry.Name)

		// Check if file exists in working tree
		content, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		// Check if working tree differs from index
		currentSHA := utils.HashObject("blob", content)
		if currentSHA != entry.SHA {
			// File has uncommitted changes
			// Check if target has different content
			if targetSHA := targetFiles[entry.Name]; targetSHA != "" && targetSHA != entry.SHA {
				return fmt.Errorf("error: Your local changes to the following files would be overwritten by checkout:\n\t%s\nPlease commit your changes or stash them before you switch branches.", entry.Name)
			}
		}
	}

	return nil
}

func updateWorkTree(gitDir, workTree, sha string) error {
	treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, sha)
	if err != nil {
		return err
	}

	newFiles, err := objects.ReadTreeRecursive(gitDir, treeSHA, "")
	if err != nil {
		return err
	}

	// Read current index
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get files in current index
	oldFiles := make(map[string]bool)
	for _, entry := range idx.Entries {
		oldFiles[entry.Name] = true
	}

	// Remove files that are not in target
	for path := range oldFiles {
		if _, ok := newFiles[path]; !ok {
			fullPath := filepath.Join(workTree, path)
			os.Remove(fullPath)
			// Clean up empty directories
			cleanEmptyDirs(filepath.Dir(fullPath), workTree)
		}
	}

	// Create/update files in target
	idx.Clear()
	for path, blobSHA := range newFiles {
		_, content, err := objects.ReadObject(gitDir, blobSHA)
		if err != nil {
			continue
		}

		fullPath := filepath.Join(workTree, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			continue
		}

		if err := os.WriteFile(fullPath, content, 0644); err != nil {
			continue
		}

		// Update index
		info, _ := os.Stat(fullPath)
		if info != nil {
			entry := index.CreateEntryFromFile(path, blobSHA, info)
			idx.AddEntry(entry)
		}
	}

	return index.WriteIndex(gitDir, idx)
}

func cleanEmptyDirs(dir, root string) {
	for dir != root && dir != "" {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			break
		}
		os.Remove(dir)
		dir = filepath.Dir(dir)
	}
}
