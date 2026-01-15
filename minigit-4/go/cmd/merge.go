package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/merge"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Merge merges branches
func Merge(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	noCommit := false
	abort := false
	var branchName string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--no-commit":
			noCommit = true
		case "--abort":
			abort = true
		default:
			if !strings.HasPrefix(args[i], "-") && branchName == "" {
				branchName = args[i]
			}
		}
	}

	if abort {
		return abortMerge(repoRoot)
	}

	if branchName == "" {
		return fmt.Errorf("branch name required")
	}

	// Get current HEAD
	headSHA, err := refs.ResolveRef(repoRoot, "HEAD")
	if err != nil {
		return err
	}

	// Get branch to merge
	mergeSHA, err := refs.ResolveRef(repoRoot, branchName)
	if err != nil {
		return fmt.Errorf("branch '%s' not found", branchName)
	}

	// Check if already up to date
	if headSHA == mergeSHA {
		fmt.Println("Already up to date.")
		return nil
	}

	// Find merge base
	mergeBase, err := findMergeBase(repoRoot, headSHA, mergeSHA)
	if err != nil {
		mergeBase = ""
	}

	// Check for fast-forward
	if mergeBase == headSHA {
		return fastForwardMerge(repoRoot, branchName, mergeSHA, noCommit)
	}

	// Three-way merge
	return threeWayMerge(repoRoot, branchName, headSHA, mergeSHA, mergeBase, noCommit)
}

func fastForwardMerge(repoRoot, branchName, targetSHA string, noCommit bool) error {
	if noCommit {
		// For --no-commit, update working tree and stage files, but don't update ref
		// Get current HEAD tree to compare
		headSHA, _ := refs.ResolveRef(repoRoot, "HEAD")
		currentTree := make(map[string]string)
		if headSHA != "" {
			currentTree, _ = getCommitTreeFiles(repoRoot, headSHA)
		}

		// Get target tree
		targetTree, err := getCommitTreeFiles(repoRoot, targetSHA)
		if err != nil {
			return err
		}

		// Read current index
		idx, err := index.ReadIndex(repoRoot)
		if err != nil {
			idx = index.NewIndex()
		}

		// Add new/modified files from target
		for name, sha := range targetTree {
			// Skip if already in HEAD with same SHA
			if currentTree[name] == sha {
				continue
			}

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

			// Stage the file
			info, _ := os.Stat(absPath)
			idx.AddEntry(name, sha, 0100644, info)
		}

		// Write index
		if err := index.WriteIndex(repoRoot, idx); err != nil {
			return err
		}

		// Save merge state
		mergeHeadPath := filepath.Join(repoRoot, ".minigit", "MERGE_HEAD")
		utils.WriteFile(mergeHeadPath, []byte(targetSHA+"\n"), 0644)

		return nil
	}

	// Update HEAD (either branch or detached)
	currentBranch, _ := refs.GetCurrentBranch(repoRoot)

	if currentBranch != "" {
		if err := refs.UpdateRef(repoRoot, filepath.Join("refs", "heads", currentBranch), targetSHA); err != nil {
			return err
		}
	} else {
		if err := refs.SetHEAD(repoRoot, targetSHA); err != nil {
			return err
		}
	}

	// Update working tree
	if err := updateWorkingTree(repoRoot, targetSHA); err != nil {
		return err
	}

	fmt.Printf("Fast-forward\n")
	return nil
}

func threeWayMerge(repoRoot, branchName, headSHA, mergeSHA, mergeBase string, noCommit bool) error {
	// Get trees
	headTree, err := getCommitTreeFiles(repoRoot, headSHA)
	if err != nil {
		return err
	}

	mergeTree, err := getCommitTreeFiles(repoRoot, mergeSHA)
	if err != nil {
		return err
	}

	baseTree := make(map[string]string)
	if mergeBase != "" {
		baseTree, _ = getCommitTreeFiles(repoRoot, mergeBase)
	}

	// Collect all files
	allFiles := make(map[string]bool)
	for f := range headTree {
		allFiles[f] = true
	}
	for f := range mergeTree {
		allFiles[f] = true
	}
	for f := range baseTree {
		allFiles[f] = true
	}

	// Merge each file
	hasConflicts := false
	newIndex := index.NewIndex()

	for name := range allFiles {
		baseSHA := baseTree[name]
		headFileSHA := headTree[name]
		mergeFileSHA := mergeTree[name]

		// Get contents
		baseContent := ""
		headContent := ""
		mergeContent := ""

		if baseSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, baseSHA)
			if err == nil {
				baseContent = string(data)
			}
		}

		if headFileSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, headFileSHA)
			if err == nil {
				headContent = string(data)
			}
		}

		if mergeFileSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, mergeFileSHA)
			if err == nil {
				mergeContent = string(data)
			}
		}

		// Determine merge result
		var resultContent string
		var resultSHA string

		if headFileSHA == mergeFileSHA {
			// Both same, no conflict
			resultContent = headContent
			resultSHA = headFileSHA
		} else if headFileSHA == baseSHA {
			// Only merge changed, take merge
			resultContent = mergeContent
			resultSHA = mergeFileSHA
		} else if mergeFileSHA == baseSHA {
			// Only head changed, keep head
			resultContent = headContent
			resultSHA = headFileSHA
		} else if headFileSHA == "" && mergeFileSHA != "" {
			// File only in merge
			if baseSHA == "" {
				// New in merge
				resultContent = mergeContent
				resultSHA = mergeFileSHA
			} else {
				// Deleted in head, modified in merge - conflict
				hasConflicts = true
				result := merge.ThreeWayMerge(baseContent, "", mergeContent, "HEAD", branchName)
				resultContent = result.Content
				resultSHA, _ = objects.WriteBlob(repoRoot, []byte(resultContent))
			}
		} else if mergeFileSHA == "" && headFileSHA != "" {
			// File only in head
			if baseSHA == "" {
				// New in head
				resultContent = headContent
				resultSHA = headFileSHA
			} else {
				// Deleted in merge, modified in head - conflict
				hasConflicts = true
				result := merge.ThreeWayMerge(baseContent, headContent, "", "HEAD", branchName)
				resultContent = result.Content
				resultSHA, _ = objects.WriteBlob(repoRoot, []byte(resultContent))
			}
		} else {
			// Both changed differently - need three-way merge
			result := merge.ThreeWayMerge(baseContent, headContent, mergeContent, "HEAD", branchName)
			resultContent = result.Content
			if result.Conflicts {
				hasConflicts = true
			}
			resultSHA, _ = objects.WriteBlob(repoRoot, []byte(resultContent))
		}

		// Write result to working tree and index
		if resultSHA != "" {
			absPath := filepath.Join(repoRoot, name)
			if err := utils.WriteFile(absPath, []byte(resultContent), 0644); err != nil {
				continue
			}

			info, _ := os.Stat(absPath)
			newIndex.AddEntry(name, resultSHA, 0100644, info)
		}
	}

	// Write index
	if err := index.WriteIndex(repoRoot, newIndex); err != nil {
		return err
	}

	if hasConflicts {
		// Save merge state
		mergeHeadPath := filepath.Join(repoRoot, ".minigit", "MERGE_HEAD")
		utils.WriteFile(mergeHeadPath, []byte(mergeSHA+"\n"), 0644)

		return fmt.Errorf("Automatic merge failed; fix conflicts and then commit the result")
	}

	if noCommit {
		// Save merge state for later commit
		mergeHeadPath := filepath.Join(repoRoot, ".minigit", "MERGE_HEAD")
		utils.WriteFile(mergeHeadPath, []byte(mergeSHA+"\n"), 0644)
		return nil
	}

	// Create merge commit
	return createMergeCommit(repoRoot, branchName, headSHA, mergeSHA)
}

func createMergeCommit(repoRoot, branchName, headSHA, mergeSHA string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Build tree
	treeSHA, err := buildTreeFromIndex(repoRoot, idx)
	if err != nil {
		return err
	}

	// Get author/committer info
	authorName := os.Getenv("GIT_AUTHOR_NAME")
	if authorName == "" {
		authorName = "Unknown"
	}
	authorEmail := os.Getenv("GIT_AUTHOR_EMAIL")
	if authorEmail == "" {
		authorEmail = "unknown@example.com"
	}
	committerName := os.Getenv("GIT_COMMITTER_NAME")
	if committerName == "" {
		committerName = authorName
	}
	committerEmail := os.Getenv("GIT_COMMITTER_EMAIL")
	if committerEmail == "" {
		committerEmail = authorEmail
	}

	timestamp := time.Now()
	authorDate := os.Getenv("GIT_AUTHOR_DATE")
	if authorDate != "" {
		if t, err := time.Parse(time.RFC3339, authorDate); err == nil {
			timestamp = t
		}
	}

	committerTime := timestamp
	committerDate := os.Getenv("GIT_COMMITTER_DATE")
	if committerDate != "" {
		if t, err := time.Parse(time.RFC3339, committerDate); err == nil {
			committerTime = t
		}
	}

	_, tzOffset := timestamp.Zone()
	tzHours := tzOffset / 3600
	tzMins := (tzOffset % 3600) / 60
	if tzMins < 0 {
		tzMins = -tzMins
	}
	tzStr := fmt.Sprintf("%+03d%02d", tzHours, tzMins)

	author := fmt.Sprintf("%s <%s> %d %s", authorName, authorEmail, timestamp.Unix(), tzStr)

	_, tzOffset = committerTime.Zone()
	tzHours = tzOffset / 3600
	tzMins = (tzOffset % 3600) / 60
	if tzMins < 0 {
		tzMins = -tzMins
	}
	tzStr = fmt.Sprintf("%+03d%02d", tzHours, tzMins)

	committer := fmt.Sprintf("%s <%s> %d %s", committerName, committerEmail, committerTime.Unix(), tzStr)

	// Create commit
	commit := &objects.Commit{
		Tree:      treeSHA,
		Parents:   []string{headSHA, mergeSHA},
		Author:    author,
		Committer: committer,
		Message:   fmt.Sprintf("Merge branch '%s'", branchName),
	}

	commitSHA, err := objects.WriteCommit(repoRoot, commit)
	if err != nil {
		return err
	}

	// Update HEAD
	currentBranch, _ := refs.GetCurrentBranch(repoRoot)
	if currentBranch != "" {
		err = refs.UpdateRef(repoRoot, filepath.Join("refs", "heads", currentBranch), commitSHA)
	} else {
		err = refs.SetHEAD(repoRoot, commitSHA)
	}
	if err != nil {
		return err
	}

	// Clean up merge state
	os.Remove(filepath.Join(repoRoot, ".minigit", "MERGE_HEAD"))

	fmt.Printf("Merge made by the 'recursive' strategy.\n")
	return nil
}

func findMergeBase(repoRoot, sha1, sha2 string) (string, error) {
	// Get all ancestors of sha1
	ancestors1, err := merge.GetAllAncestors(func(sha string) ([]string, error) {
		_, data, err := objects.ReadObject(repoRoot, sha)
		if err != nil {
			return nil, err
		}
		commit, err := objects.ParseCommit(data)
		if err != nil {
			return nil, err
		}
		return commit.Parents, nil
	}, sha1)
	if err != nil {
		return "", err
	}

	// BFS from sha2 to find first common ancestor
	visited := make(map[string]bool)
	toVisit := []string{sha2}

	for len(toVisit) > 0 {
		current := toVisit[0]
		toVisit = toVisit[1:]

		if visited[current] {
			continue
		}
		visited[current] = true

		if ancestors1[current] {
			return current, nil
		}

		_, data, err := objects.ReadObject(repoRoot, current)
		if err != nil {
			continue
		}
		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}
		toVisit = append(toVisit, commit.Parents...)
	}

	return "", fmt.Errorf("no common ancestor")
}

func abortMerge(repoRoot string) error {
	// Check if merge in progress
	mergeHeadPath := filepath.Join(repoRoot, ".minigit", "MERGE_HEAD")
	if !utils.FileExists(mergeHeadPath) {
		return fmt.Errorf("no merge in progress")
	}

	// Get HEAD
	headSHA, err := refs.ResolveRef(repoRoot, "HEAD")
	if err != nil {
		return err
	}

	// Reset to HEAD
	if err := updateWorkingTree(repoRoot, headSHA); err != nil {
		return err
	}

	// Remove merge state
	os.Remove(mergeHeadPath)

	return nil
}
