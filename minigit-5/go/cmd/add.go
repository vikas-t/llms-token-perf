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

// Add stages files for commit
func Add(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	var paths []string
	allFlag := false
	updateFlag := false

	for _, arg := range args {
		switch arg {
		case "-A", "--all":
			allFlag = true
		case "-u", "--update":
			updateFlag = true
		default:
			paths = append(paths, arg)
		}
	}

	// Read current index
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	if allFlag || updateFlag {
		// Handle -A or -u flags
		return addAllOrUpdate(gitDir, workTree, idx, allFlag, updateFlag)
	}

	if len(paths) == 0 {
		return fmt.Errorf("nothing specified, nothing added")
	}

	// Process each path
	for _, path := range paths {
		absPath := path
		if !filepath.IsAbs(path) {
			absPath = filepath.Join(workTree, path)
		}

		// Check if path exists
		info, err := os.Stat(absPath)
		if err != nil {
			return fmt.Errorf("pathspec '%s' did not match any files", path)
		}

		if info.IsDir() {
			if err := addDirectory(gitDir, workTree, idx, absPath); err != nil {
				return err
			}
		} else {
			if err := addFile(gitDir, workTree, idx, absPath); err != nil {
				return err
			}
		}
	}

	return index.WriteIndex(gitDir, idx)
}

func addFile(gitDir, workTree string, idx *index.Index, absPath string) error {
	// Read file content
	content, err := os.ReadFile(absPath)
	if err != nil {
		return err
	}

	// Create blob object
	sha, err := objects.WriteObject(gitDir, objects.TypeBlob, content)
	if err != nil {
		return err
	}

	// Get relative path
	relPath, err := filepath.Rel(workTree, absPath)
	if err != nil {
		return err
	}
	relPath = utils.NormalizePath(relPath)

	// Get file info
	info, err := os.Stat(absPath)
	if err != nil {
		return err
	}

	// Create index entry
	entry := index.CreateEntryFromFile(relPath, sha, info)
	idx.AddEntry(entry)

	return nil
}

func addDirectory(gitDir, workTree string, idx *index.Index, dirPath string) error {
	return filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip .minigit directory
		if info.IsDir() && info.Name() == ".minigit" {
			return filepath.SkipDir
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		return addFile(gitDir, workTree, idx, path)
	})
}

func addAllOrUpdate(gitDir, workTree string, idx *index.Index, allFlag, updateFlag bool) error {
	// Get currently tracked files
	trackedFiles := make(map[string]bool)
	for _, entry := range idx.Entries {
		trackedFiles[entry.Name] = true
	}

	// Also check HEAD for tracked files
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

	// Handle deletions
	for path := range trackedFiles {
		fullPath := filepath.Join(workTree, path)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			// File was deleted
			idx.RemoveEntry(path)
		}
	}

	// Walk working tree
	err = filepath.Walk(workTree, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return nil // Skip errors
		}

		// Skip .minigit directory
		if info.IsDir() && info.Name() == ".minigit" {
			return filepath.SkipDir
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		relPath, relErr := filepath.Rel(workTree, path)
		if relErr != nil {
			return nil
		}
		relPath = utils.NormalizePath(relPath)

		// Skip hidden files starting with .
		if strings.HasPrefix(relPath, ".") || strings.Contains(relPath, "/.") {
			return nil
		}

		if updateFlag && !trackedFiles[relPath] {
			// -u only updates tracked files
			return nil
		}

		return addFile(gitDir, workTree, idx, path)
	})

	if err != nil {
		return err
	}

	return index.WriteIndex(gitDir, idx)
}
