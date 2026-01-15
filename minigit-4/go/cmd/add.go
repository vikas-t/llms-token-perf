package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/objects"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
)

// Add stages files for commit
func Add(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Parse flags
	var paths []string
	allFlag := false
	updateFlag := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-A", "--all":
			allFlag = true
		case "-u", "--update":
			updateFlag = true
		default:
			paths = append(paths, args[i])
		}
	}

	if allFlag {
		// Stage all changes (new, modified, deleted)
		return addAll(repoRoot, idx)
	}

	if updateFlag {
		// Stage only tracked files (modified and deleted)
		return addUpdate(repoRoot, idx)
	}

	if len(paths) == 0 {
		return fmt.Errorf("nothing specified, nothing added")
	}

	for _, path := range paths {
		if err := addPath(repoRoot, cwd, idx, path); err != nil {
			return err
		}
	}

	return index.WriteIndex(repoRoot, idx)
}

func addPath(repoRoot, cwd string, idx *index.Index, path string) error {
	// Make path absolute
	var absPath string
	if filepath.IsAbs(path) {
		absPath = path
	} else {
		absPath = filepath.Join(cwd, path)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("pathspec '%s' did not match any files", path)
	}

	if info.IsDir() {
		return addDirectory(repoRoot, idx, absPath)
	}

	return addFile(repoRoot, idx, absPath)
}

func addFile(repoRoot string, idx *index.Index, absPath string) error {
	// Get relative path from repo root
	relPath, err := filepath.Rel(repoRoot, absPath)
	if err != nil {
		return err
	}
	relPath = filepath.ToSlash(relPath)

	// Read file content
	content, err := utils.ReadFile(absPath)
	if err != nil {
		return err
	}

	// Write blob
	sha, err := objects.WriteBlob(repoRoot, content)
	if err != nil {
		return err
	}

	// Get file mode
	mode, err := utils.GetFileMode(absPath)
	if err != nil {
		return err
	}

	// Get file info
	info, err := os.Stat(absPath)
	if err != nil {
		return err
	}

	// Add to index
	idx.AddEntry(relPath, sha, mode, info)

	return nil
}

func addDirectory(repoRoot string, idx *index.Index, dirPath string) error {
	return filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip .minigit directory
		if info.IsDir() && info.Name() == ".minigit" {
			return filepath.SkipDir
		}

		if info.IsDir() {
			return nil
		}

		return addFile(repoRoot, idx, path)
	})
}

func addAll(repoRoot string, idx *index.Index) error {
	// First, mark all existing entries for potential deletion
	existingEntries := make(map[string]bool)
	for name := range idx.Entries {
		existingEntries[name] = true
	}

	// Walk the working directory and add all files
	err := filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files with errors
		}

		// Skip .minigit directory
		if info.IsDir() && info.Name() == ".minigit" {
			return filepath.SkipDir
		}

		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil
		}
		relPath = filepath.ToSlash(relPath)

		// Skip if path starts with .minigit
		if strings.HasPrefix(relPath, ".minigit") {
			return nil
		}

		// Remove from pending deletion
		delete(existingEntries, relPath)

		// Add file
		return addFile(repoRoot, idx, path)
	})
	if err != nil {
		return err
	}

	// Remove entries for deleted files
	for name := range existingEntries {
		idx.RemoveEntry(name)
	}

	return index.WriteIndex(repoRoot, idx)
}

func addUpdate(repoRoot string, idx *index.Index) error {
	// Only update tracked files
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
			// File modified, update index
			err = addFile(repoRoot, idx, absPath)
			if err != nil {
				continue
			}
		}

		// Update mode if changed
		mode, err := utils.GetFileMode(absPath)
		if err == nil && mode != entry.Mode {
			entry.Mode = mode
			entry.Mtime = info.ModTime().Unix()
			entry.MtimeNano = int32(info.ModTime().Nanosecond())
		}
	}

	return index.WriteIndex(repoRoot, idx)
}
