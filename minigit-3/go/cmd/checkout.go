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

	if len(args) == 0 {
		return fmt.Errorf("no target specified")
	}

	// Parse flags
	createBranch := false
	var target string
	var paths []string
	sawDoubleDash := false

	for i := 0; i < len(args); i++ {
		if args[i] == "--" {
			sawDoubleDash = true
			paths = args[i+1:]
			break
		} else if args[i] == "-b" {
			createBranch = true
		} else if strings.HasPrefix(args[i], "-") {
			// Unknown flag, ignore
		} else if target == "" {
			target = args[i]
		} else {
			paths = append(paths, args[i])
		}
	}

	// Handle checkout -- files (restore from index)
	if sawDoubleDash && target == "" {
		return restoreFromIndex(repoRoot, paths)
	}

	// Handle checkout <commit> -- files (restore from commit)
	if sawDoubleDash && target != "" {
		return restoreFromCommit(repoRoot, target, paths)
	}

	// Handle checkout -- files where first arg looks like a file
	if target != "" && len(paths) == 0 && !createBranch {
		// Check if target is a file path
		fullPath := filepath.Join(repoRoot, target)
		if _, err := os.Stat(fullPath); err == nil {
			// It's a file, restore from index
			return restoreFromIndex(repoRoot, []string{target})
		}
	}

	// Handle checkout -b <branch> [start-point]
	if createBranch {
		var startPoint string
		if len(paths) > 0 {
			startPoint = paths[0]
		}
		return createAndCheckoutBranch(repoRoot, target, startPoint)
	}

	// Handle checkout <branch> or checkout <commit>
	return checkoutRef(repoRoot, target)
}

func restoreFromIndex(repoRoot string, paths []string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	for _, path := range paths {
		entry := idx.GetEntry(path)
		if entry == nil {
			return fmt.Errorf("error: pathspec '%s' did not match any file(s) known to git", path)
		}

		content, err := getObjectContent(repoRoot, entry.GetSHAHex())
		if err != nil {
			return err
		}

		fullPath := filepath.Join(repoRoot, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return err
		}

		mode := os.FileMode(0644)
		if entry.Mode&0111 != 0 {
			mode = 0755
		}

		if err := os.WriteFile(fullPath, content, mode); err != nil {
			return err
		}
	}

	return nil
}

func restoreFromCommit(repoRoot, commitRef string, paths []string) error {
	sha, err := refs.ResolveRef(repoRoot, commitRef)
	if err != nil {
		return fmt.Errorf("error: pathspec '%s' did not match any file(s)", commitRef)
	}

	treeSHA, err := getTreeFromCommit(repoRoot, sha)
	if err != nil {
		return err
	}

	files, err := flattenTreeToFiles(repoRoot, treeSHA, "")
	if err != nil {
		return err
	}

	for _, path := range paths {
		fileSHA, ok := files[path]
		if !ok {
			return fmt.Errorf("error: pathspec '%s' did not match any file(s)", path)
		}

		content, err := getObjectContent(repoRoot, fileSHA)
		if err != nil {
			return err
		}

		fullPath := filepath.Join(repoRoot, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return err
		}

		if err := os.WriteFile(fullPath, content, 0644); err != nil {
			return err
		}

		// Update index
		idx, err := index.ReadIndex(repoRoot)
		if err == nil {
			entry := idx.GetEntry(path)
			if entry != nil {
				entry.SetSHAFromHex(fileSHA)
				entry.Size = uint32(len(content))
				idx.WriteIndex(repoRoot)
			}
		}
	}

	return nil
}

func createAndCheckoutBranch(repoRoot, branchName, startPoint string) error {
	// Validate branch name
	if err := validateBranchName(branchName); err != nil {
		return err
	}

	// Check if branch already exists
	branchPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", branchName)
	if _, err := os.Stat(branchPath); err == nil {
		return fmt.Errorf("fatal: a branch named '%s' already exists", branchName)
	}

	// Get current HEAD SHA before any changes
	currentSHA, _ := refs.ResolveHEAD(repoRoot)

	// Get target commit
	var targetSHA string
	var err error

	if startPoint != "" {
		targetSHA, err = refs.ResolveRef(repoRoot, startPoint)
		if err != nil {
			return fmt.Errorf("fatal: not a valid object name: '%s'", startPoint)
		}
	} else {
		targetSHA, err = refs.ResolveHEAD(repoRoot)
		if err != nil {
			return fmt.Errorf("fatal: cannot create branch: no commits yet")
		}
	}

	// Create branch
	if err := refs.UpdateRef(repoRoot, "refs/heads/"+branchName, targetSHA); err != nil {
		return err
	}

	// Update HEAD to point to new branch
	if err := refs.UpdateHEAD(repoRoot, branchName, true); err != nil {
		return err
	}

	// If start point is different from current, update working tree
	if currentSHA != targetSHA {
		if err := updateWorkingTree(repoRoot, targetSHA); err != nil {
			return err
		}
	}

	fmt.Printf("Switched to a new branch '%s'\n", branchName)
	return nil
}

func checkoutRef(repoRoot, ref string) error {
	// Try to resolve as branch first
	branchPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", ref)
	isBranch := false
	if _, err := os.Stat(branchPath); err == nil {
		isBranch = true
	}

	targetSHA, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return fmt.Errorf("error: pathspec '%s' did not match any file(s) known to git", ref)
	}

	// Check for uncommitted changes that would be overwritten
	if err := checkForConflictingChanges(repoRoot, targetSHA); err != nil {
		return err
	}

	// Update working tree
	if err := updateWorkingTree(repoRoot, targetSHA); err != nil {
		return err
	}

	// Update HEAD
	if isBranch {
		if err := refs.UpdateHEAD(repoRoot, ref, true); err != nil {
			return err
		}
		fmt.Printf("Switched to branch '%s'\n", ref)
	} else {
		if err := refs.UpdateHEAD(repoRoot, targetSHA, false); err != nil {
			return err
		}
		fmt.Printf("HEAD is now at %s\n", targetSHA[:7])
	}

	return nil
}

func checkForConflictingChanges(repoRoot, targetSHA string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return nil // No index, no conflicts
	}

	targetTree, err := getTreeFromCommit(repoRoot, targetSHA)
	if err != nil {
		return nil
	}

	targetFiles, err := flattenTreeToFiles(repoRoot, targetTree, "")
	if err != nil {
		return nil
	}

	// Check each indexed file
	for _, entry := range idx.Entries {
		fullPath := filepath.Join(repoRoot, entry.Name)

		// Read working tree file
		workingContent, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		// Get index content
		indexContent, _ := getObjectContent(repoRoot, entry.GetSHAHex())

		// If working tree differs from index, check if target also differs
		if string(workingContent) != string(indexContent) {
			// Working tree has changes
			targetSHA, hasTarget := targetFiles[entry.Name]
			if hasTarget {
				targetContent, _ := getObjectContent(repoRoot, targetSHA)
				if string(targetContent) != string(indexContent) {
					// Target differs from index - would overwrite local changes
					return fmt.Errorf("error: Your local changes to the following files would be overwritten by checkout:\n\t%s\nPlease commit your changes or stash them before you switch branches.", entry.Name)
				}
			}
		}
	}

	return nil
}

func updateWorkingTree(repoRoot, targetSHA string) error {
	targetTree, err := getTreeFromCommit(repoRoot, targetSHA)
	if err != nil {
		return err
	}

	targetFiles, err := flattenTreeToFiles(repoRoot, targetTree, "")
	if err != nil {
		return err
	}

	// Read current index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		idx = index.NewIndex()
	}

	// Get current indexed files
	currentFiles := make(map[string]bool)
	for _, entry := range idx.Entries {
		currentFiles[entry.Name] = true
	}

	// Remove files that are in current but not in target
	for path := range currentFiles {
		if _, ok := targetFiles[path]; !ok {
			fullPath := filepath.Join(repoRoot, path)
			os.Remove(fullPath)
			// Clean up empty directories
			cleanEmptyDirs(filepath.Dir(fullPath), repoRoot)
		}
	}

	// Create/update files from target
	newIndex := index.NewIndex()
	for path, sha := range targetFiles {
		content, err := getObjectContent(repoRoot, sha)
		if err != nil {
			continue
		}

		fullPath := filepath.Join(repoRoot, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			continue
		}

		// Determine mode
		mode := getModeFromTree(repoRoot, targetTree, path)
		fileMode := os.FileMode(0644)
		if mode == "100755" {
			fileMode = 0755
		}

		if err := os.WriteFile(fullPath, content, fileMode); err != nil {
			continue
		}

		// Add to index
		info, err := os.Stat(fullPath)
		if err != nil {
			continue
		}

		entry := index.IndexEntry{
			Name: path,
			Size: uint32(len(content)),
		}

		if mode == "100755" {
			entry.Mode = 0100755
		} else {
			entry.Mode = 0100644
		}

		entry.SetSHAFromHex(sha)
		newIndex.AddEntry(entry)

		_ = info
	}

	return newIndex.WriteIndex(repoRoot)
}

func cleanEmptyDirs(dir, repoRoot string) {
	for dir != repoRoot && dir != "." && dir != "/" {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			break
		}
		os.Remove(dir)
		dir = filepath.Dir(dir)
	}
}

func getModeFromTree(repoRoot, treeSHA, path string) string {
	parts := strings.Split(path, "/")
	currentTree := treeSHA

	for i, part := range parts {
		_, content, err := utils.ReadObject(repoRoot, currentTree)
		if err != nil {
			return "100644"
		}

		entries, err := objects.ParseTree(content)
		if err != nil {
			return "100644"
		}

		for _, entry := range entries {
			if entry.Name == part {
				if i == len(parts)-1 {
					return entry.Mode
				}
				currentTree = entry.SHA
				break
			}
		}
	}

	return "100644"
}
