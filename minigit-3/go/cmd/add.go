package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"syscall"
)

// Add stages files for commit
func Add(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("nothing specified, nothing added")
	}

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

	// Check for flags
	addAll := false
	updateOnly := false
	var paths []string

	for _, arg := range args {
		switch arg {
		case "-A", "--all":
			addAll = true
		case "-u", "--update":
			updateOnly = true
		default:
			paths = append(paths, arg)
		}
	}

	if addAll || updateOnly {
		// Stage all/update from repo root
		if len(paths) == 0 {
			paths = []string{"."}
		}
	}

	if len(paths) == 0 {
		return fmt.Errorf("nothing specified, nothing added")
	}

	// Get currently tracked files (from index and HEAD)
	trackedFiles := make(map[string]bool)
	for _, entry := range idx.Entries {
		trackedFiles[entry.Name] = true
	}

	// Also add files from HEAD commit
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err == nil {
		headTree, err := getTreeFromCommit(repoRoot, headSHA)
		if err == nil {
			files, _ := flattenTreeToFiles(repoRoot, headTree, "")
			for path := range files {
				trackedFiles[path] = true
			}
		}
	}

	// Process each path
	for _, path := range paths {
		var absPath string
		if filepath.IsAbs(path) {
			absPath = path
		} else {
			absPath = filepath.Join(cwd, path)
		}

		relPath, err := utils.RelativePath(repoRoot, absPath)
		if err != nil {
			return err
		}

		info, statErr := os.Stat(absPath)

		if statErr != nil && !os.IsNotExist(statErr) {
			return fmt.Errorf("cannot stat '%s': %v", path, statErr)
		}

		if os.IsNotExist(statErr) {
			// File doesn't exist - might be a deletion
			if addAll || updateOnly {
				// Remove from index if it was tracked
				if idx.RemoveEntry(relPath) {
					continue
				}
			}
			return fmt.Errorf("pathspec '%s' did not match any files", path)
		}

		if info.IsDir() {
			// Process directory recursively
			err = filepath.Walk(absPath, func(walkPath string, walkInfo os.FileInfo, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}

				// Skip .minigit directory
				if walkInfo.IsDir() && walkInfo.Name() == ".minigit" {
					return filepath.SkipDir
				}

				if walkInfo.IsDir() {
					return nil
				}

				walkRel, err := utils.RelativePath(repoRoot, walkPath)
				if err != nil {
					return err
				}

				// If updateOnly, only add tracked files
				if updateOnly && !trackedFiles[walkRel] {
					return nil
				}

				return addFileToIndex(repoRoot, idx, walkPath, walkRel, walkInfo)
			})
			if err != nil {
				return err
			}

			// Handle deletions if -A flag
			if addAll {
				for trackedPath := range trackedFiles {
					if relPath == "." || filepath.HasPrefix(trackedPath, relPath+"/") || trackedPath == relPath {
						fullPath := filepath.Join(repoRoot, trackedPath)
						if _, err := os.Stat(fullPath); os.IsNotExist(err) {
							idx.RemoveEntry(trackedPath)
						}
					}
				}
			}
		} else {
			// Single file
			if updateOnly && !trackedFiles[relPath] {
				continue // Skip untracked files with -u
			}

			err = addFileToIndex(repoRoot, idx, absPath, relPath, info)
			if err != nil {
				return err
			}
		}
	}

	return idx.WriteIndex(repoRoot)
}

func addFileToIndex(repoRoot string, idx *index.Index, absPath, relPath string, info os.FileInfo) error {
	// Check if it's a symlink
	linkInfo, err := os.Lstat(absPath)
	if err != nil {
		return err
	}

	var content []byte
	var mode uint32

	if linkInfo.Mode()&os.ModeSymlink != 0 {
		// Symlink
		target, err := os.Readlink(absPath)
		if err != nil {
			return err
		}
		content = []byte(target)
		mode = 0120000 // symlink mode
	} else {
		// Regular file
		content, err = os.ReadFile(absPath)
		if err != nil {
			return err
		}

		// Determine mode
		if info.Mode()&0111 != 0 {
			mode = 0100755 // executable
		} else {
			mode = 0100644 // regular file
		}
	}

	// Create blob object
	sha, err := objects.CreateBlob(repoRoot, content)
	if err != nil {
		return err
	}

	// Get file stats
	stat := info.Sys().(*syscall.Stat_t)

	entry := index.IndexEntry{
		Ctime:     uint32(stat.Ctimespec.Sec),
		CtimeNano: uint32(stat.Ctimespec.Nsec),
		Mtime:     uint32(stat.Mtimespec.Sec),
		MtimeNano: uint32(stat.Mtimespec.Nsec),
		Dev:       uint32(stat.Dev),
		Ino:       uint32(stat.Ino),
		Mode:      mode,
		Uid:       stat.Uid,
		Gid:       stat.Gid,
		Size:      uint32(info.Size()),
		Name:      relPath,
	}

	if err := entry.SetSHAFromHex(sha); err != nil {
		return err
	}

	idx.AddEntry(entry)
	return nil
}

func getTreeFromCommit(repoRoot, commitSHA string) (string, error) {
	objType, content, err := utils.ReadObject(repoRoot, commitSHA)
	if err != nil {
		return "", err
	}
	if objType != "commit" {
		return "", fmt.Errorf("not a commit: %s", commitSHA)
	}
	commit, err := objects.ParseCommit(content)
	if err != nil {
		return "", err
	}
	return commit.Tree, nil
}

func flattenTreeToFiles(repoRoot, treeSHA, prefix string) (map[string]string, error) {
	result := make(map[string]string)

	if treeSHA == "" {
		return result, nil
	}

	_, content, err := utils.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return nil, err
	}

	entries, err := objects.ParseTree(content)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		if entry.Mode == "40000" {
			subEntries, err := flattenTreeToFiles(repoRoot, entry.SHA, path)
			if err != nil {
				return nil, err
			}
			for k, v := range subEntries {
				result[k] = v
			}
		} else {
			result[path] = entry.SHA
		}
	}

	return result, nil
}
