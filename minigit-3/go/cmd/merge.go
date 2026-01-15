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

// Merge merges a branch into the current branch
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

	for _, arg := range args {
		switch arg {
		case "--no-commit":
			noCommit = true
		case "--abort":
			abort = true
		default:
			if !strings.HasPrefix(arg, "-") {
				branchName = arg
			}
		}
	}

	if abort {
		return abortMerge(repoRoot)
	}

	if branchName == "" {
		return fmt.Errorf("merge requires a branch name")
	}

	// Resolve the branch to merge
	theirsSHA, err := refs.ResolveRef(repoRoot, branchName)
	if err != nil {
		return fmt.Errorf("merge: '%s' - not something we can merge", branchName)
	}

	// Get current HEAD
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err != nil {
		return fmt.Errorf("cannot merge: no commits on current branch")
	}

	// Check if already up to date
	if headSHA == theirsSHA {
		fmt.Println("Already up to date.")
		return nil
	}

	// Check if we can fast-forward
	isAncestorResult, err := merge.IsAncestor(repoRoot, headSHA, theirsSHA)
	if err == nil && isAncestorResult {
		// Fast-forward merge
		if noCommit {
			return fastForwardNoCommit(repoRoot, headSHA, theirsSHA, branchName)
		}
		return fastForwardMerge(repoRoot, theirsSHA, branchName)
	}

	// Check if theirs is ancestor of ours (already merged)
	isTheirsAncestor, err := merge.IsAncestor(repoRoot, theirsSHA, headSHA)
	if err == nil && isTheirsAncestor {
		fmt.Println("Already up to date.")
		return nil
	}

	// Find merge base
	mergeBase, err := merge.FindMergeBase(repoRoot, headSHA, theirsSHA)
	if err != nil {
		return fmt.Errorf("cannot find merge base: %v", err)
	}

	// Three-way merge
	return threeWayMerge(repoRoot, headSHA, theirsSHA, mergeBase, branchName, noCommit)
}

func fastForwardMerge(repoRoot, targetSHA, branchName string) error {
	// Update working tree
	if err := updateWorkingTree(repoRoot, targetSHA); err != nil {
		return err
	}

	// Update branch ref
	branch, _ := refs.GetCurrentBranch(repoRoot)
	if branch != "" {
		if err := refs.UpdateRef(repoRoot, "refs/heads/"+branch, targetSHA); err != nil {
			return err
		}
	} else {
		if err := refs.UpdateHEAD(repoRoot, targetSHA, false); err != nil {
			return err
		}
	}

	fmt.Printf("Updating %s..%s\n", targetSHA[:7], targetSHA[:7])
	fmt.Println("Fast-forward")
	return nil
}

func fastForwardNoCommit(repoRoot, currentSHA, targetSHA, branchName string) error {
	// Get target tree files
	targetTree, err := getTreeFromCommit(repoRoot, targetSHA)
	if err != nil {
		return err
	}

	targetFiles, err := flattenTreeToFiles(repoRoot, targetTree, "")
	if err != nil {
		return err
	}

	// Get current tree files
	currentTree, _ := getTreeFromCommit(repoRoot, currentSHA)
	currentFiles, _ := flattenTreeToFiles(repoRoot, currentTree, "")

	// Read current index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		idx = index.NewIndex()
	}

	// Add new/modified files from target to working tree and index
	for path, sha := range targetFiles {
		// Skip files that are the same
		if currentFiles[path] == sha {
			continue
		}

		content, err := getObjectContent(repoRoot, sha)
		if err != nil {
			continue
		}

		fullPath := filepath.Join(repoRoot, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			continue
		}

		if err := os.WriteFile(fullPath, content, 0644); err != nil {
			continue
		}

		// Add to index (staging)
		entry := index.IndexEntry{
			Name: path,
			Size: uint32(len(content)),
			Mode: 0100644,
		}
		entry.SetSHAFromHex(sha)
		idx.AddEntry(entry)
	}

	if err := idx.WriteIndex(repoRoot); err != nil {
		return err
	}

	// Save merge state
	saveMergeState(repoRoot, targetSHA, branchName)

	fmt.Println("Automatic merge went well; stopped before committing as requested")
	return nil
}

func threeWayMerge(repoRoot, oursSHA, theirsSHA, baseSHA, branchName string, noCommit bool) error {
	// Get trees
	baseTree, _ := getTreeFromCommit(repoRoot, baseSHA)
	oursTree, _ := getTreeFromCommit(repoRoot, oursSHA)
	theirsTree, _ := getTreeFromCommit(repoRoot, theirsSHA)

	baseFiles, _ := flattenTreeToFiles(repoRoot, baseTree, "")
	oursFiles, _ := flattenTreeToFiles(repoRoot, oursTree, "")
	theirsFiles, _ := flattenTreeToFiles(repoRoot, theirsTree, "")

	// Collect all paths
	allPaths := make(map[string]bool)
	for p := range baseFiles {
		allPaths[p] = true
	}
	for p := range oursFiles {
		allPaths[p] = true
	}
	for p := range theirsFiles {
		allPaths[p] = true
	}

	// Read index
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		idx = index.NewIndex()
	}

	hasConflicts := false

	for path := range allPaths {
		baseSHA := baseFiles[path]
		ourSHA := oursFiles[path]
		theirSHA := theirsFiles[path]

		var result []byte
		var conflict bool

		if ourSHA == theirSHA {
			// Same on both sides
			if ourSHA == "" {
				// Both deleted
				idx.RemoveEntry(path)
				fullPath := filepath.Join(repoRoot, path)
				os.Remove(fullPath)
				continue
			}
			result, _ = getObjectContent(repoRoot, ourSHA)
		} else if ourSHA == baseSHA {
			// Only theirs changed
			if theirSHA == "" {
				// Theirs deleted
				idx.RemoveEntry(path)
				fullPath := filepath.Join(repoRoot, path)
				os.Remove(fullPath)
				continue
			}
			result, _ = getObjectContent(repoRoot, theirSHA)
		} else if theirSHA == baseSHA {
			// Only ours changed
			if ourSHA == "" {
				// Ours deleted (already gone)
				continue
			}
			result, _ = getObjectContent(repoRoot, ourSHA)
		} else {
			// Both changed - need to merge
			var baseContent, oursContent, theirsContent []byte

			if baseSHA != "" {
				baseContent, _ = getObjectContent(repoRoot, baseSHA)
			}
			if ourSHA != "" {
				oursContent, _ = getObjectContent(repoRoot, ourSHA)
			}
			if theirSHA != "" {
				theirsContent, _ = getObjectContent(repoRoot, theirSHA)
			}

			mergeResult := merge.ThreeWayMerge(baseContent, oursContent, theirsContent, "HEAD", branchName)
			result = mergeResult.Content
			conflict = mergeResult.HasConflict

			if conflict {
				hasConflicts = true
			}
		}

		// Write result to working tree
		fullPath := filepath.Join(repoRoot, path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			continue
		}

		// Ensure content ends with newline
		if len(result) > 0 && result[len(result)-1] != '\n' {
			result = append(result, '\n')
		}

		if err := os.WriteFile(fullPath, result, 0644); err != nil {
			continue
		}

		// Update index
		if !conflict {
			sha, err := objects.CreateBlob(repoRoot, result)
			if err == nil {
				entry := index.IndexEntry{
					Name: path,
					Size: uint32(len(result)),
					Mode: 0100644,
				}
				entry.SetSHAFromHex(sha)
				idx.AddEntry(entry)
			}
		}
	}

	if err := idx.WriteIndex(repoRoot); err != nil {
		return err
	}

	if hasConflicts {
		// Save merge state
		saveMergeState(repoRoot, theirsSHA, branchName)
		return fmt.Errorf("Automatic merge failed; fix conflicts and then commit the result")
	}

	if noCommit {
		saveMergeState(repoRoot, theirsSHA, branchName)
		fmt.Println("Automatic merge went well; stopped before committing as requested")
		return nil
	}

	// Create merge commit
	return createMergeCommit(repoRoot, oursSHA, theirsSHA, branchName)
}

func createMergeCommit(repoRoot, oursSHA, theirsSHA, branchName string) error {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Build tree
	treeSHA, err := buildTreeObjectFromIndex(repoRoot, idx)
	if err != nil {
		return err
	}

	// Get author/committer info
	authorName := utils.GetEnvOrDefault("GIT_AUTHOR_NAME", "Unknown")
	authorEmail := utils.GetEnvOrDefault("GIT_AUTHOR_EMAIL", "unknown@example.com")
	committerName := utils.GetEnvOrDefault("GIT_COMMITTER_NAME", authorName)
	committerEmail := utils.GetEnvOrDefault("GIT_COMMITTER_EMAIL", authorEmail)

	authorDate := parseGitDate(os.Getenv("GIT_AUTHOR_DATE"))
	committerDate := parseGitDate(os.Getenv("GIT_COMMITTER_DATE"))

	author := objects.FormatAuthor(authorName, authorEmail, authorDate)
	committer := objects.FormatAuthor(committerName, committerEmail, committerDate)

	message := fmt.Sprintf("Merge branch '%s'", branchName)

	// Create commit with two parents
	commitSHA, err := objects.CreateCommit(repoRoot, treeSHA, []string{oursSHA, theirsSHA}, message, author, committer)
	if err != nil {
		return err
	}

	// Update branch ref
	branch, _ := refs.GetCurrentBranch(repoRoot)
	if branch != "" {
		if err := refs.UpdateRef(repoRoot, "refs/heads/"+branch, commitSHA); err != nil {
			return err
		}
	} else {
		if err := refs.UpdateHEAD(repoRoot, commitSHA, false); err != nil {
			return err
		}
	}

	// Clean up merge state
	clearMergeState(repoRoot)

	fmt.Printf("Merge made by the 'recursive' strategy.\n")
	return nil
}

func saveMergeState(repoRoot, theirsSHA, branchName string) {
	mergeHeadPath := filepath.Join(utils.MinigitPath(repoRoot), "MERGE_HEAD")
	os.WriteFile(mergeHeadPath, []byte(theirsSHA+"\n"), 0644)

	mergeMsgPath := filepath.Join(utils.MinigitPath(repoRoot), "MERGE_MSG")
	msg := fmt.Sprintf("Merge branch '%s'\n", branchName)
	os.WriteFile(mergeMsgPath, []byte(msg), 0644)
}

func clearMergeState(repoRoot string) {
	os.Remove(filepath.Join(utils.MinigitPath(repoRoot), "MERGE_HEAD"))
	os.Remove(filepath.Join(utils.MinigitPath(repoRoot), "MERGE_MSG"))
}

func abortMerge(repoRoot string) error {
	mergeHeadPath := filepath.Join(utils.MinigitPath(repoRoot), "MERGE_HEAD")
	if _, err := os.Stat(mergeHeadPath); os.IsNotExist(err) {
		return fmt.Errorf("There is no merge to abort")
	}

	// Reset to HEAD
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err != nil {
		return err
	}

	if err := updateWorkingTree(repoRoot, headSHA); err != nil {
		return err
	}

	clearMergeState(repoRoot)
	return nil
}

// Simple parseGitDate for merge
func parseGitDateMerge(dateStr string) time.Time {
	if dateStr == "" {
		return time.Now()
	}

	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05Z",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t
		}
	}

	return time.Now()
}
