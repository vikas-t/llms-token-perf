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
)

// Merge merges a branch into current branch
func Merge(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	noCommit := false
	abort := false
	var branch string

	for _, arg := range args {
		switch arg {
		case "--no-commit":
			noCommit = true
		case "--abort":
			abort = true
		default:
			if !strings.HasPrefix(arg, "-") {
				branch = arg
			}
		}
	}

	if abort {
		return abortMerge(gitDir, workTree)
	}

	if branch == "" {
		return fmt.Errorf("branch name required")
	}

	// Resolve refs
	theirsSHA, err := refs.ResolveRef(gitDir, branch)
	if err != nil {
		return fmt.Errorf("merge: %s - not something we can merge", branch)
	}

	oursSHA, err := refs.ResolveRef(gitDir, "HEAD")
	if err != nil {
		return err
	}

	// Check if already up to date
	if oursSHA == theirsSHA {
		fmt.Println("Already up to date.")
		return nil
	}

	// Check if we can fast-forward
	canFF, err := merge.CanFastForward(gitDir, oursSHA, theirsSHA)
	if err != nil {
		return err
	}

	if canFF {
		if noCommit {
			return fastForwardNoCommit(gitDir, workTree, theirsSHA)
		}
		return fastForwardMerge(gitDir, workTree, branch, theirsSHA)
	}

	// Find merge base
	baseSHA, err := merge.FindMergeBase(gitDir, oursSHA, theirsSHA)
	if err != nil {
		// No common ancestor, do merge anyway
		baseSHA = ""
	}

	// Check if theirs is ancestor of ours (already merged)
	if baseSHA == theirsSHA {
		fmt.Println("Already up to date.")
		return nil
	}

	// Three-way merge
	result, err := merge.ThreeWayMerge(gitDir, oursSHA, theirsSHA, baseSHA)
	if err != nil {
		return err
	}

	// Write merged files to working tree
	for path, content := range result.MergedFiles {
		fullPath := filepath.Join(workTree, path)
		if content == nil {
			os.Remove(fullPath)
			cleanEmptyDirs(filepath.Dir(fullPath), workTree)
		} else {
			os.MkdirAll(filepath.Dir(fullPath), 0755)
			os.WriteFile(fullPath, content, 0644)
		}
	}

	// Update index
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	for path, content := range result.MergedFiles {
		if content == nil {
			idx.RemoveEntry(path)
		} else {
			sha, err := objects.WriteObject(gitDir, objects.TypeBlob, content)
			if err != nil {
				continue
			}
			fullPath := filepath.Join(workTree, path)
			info, _ := os.Stat(fullPath)
			if info != nil {
				entry := index.CreateEntryFromFile(path, sha, info)
				idx.AddEntry(entry)
			}
		}
	}

	if err := index.WriteIndex(gitDir, idx); err != nil {
		return err
	}

	if len(result.Conflicts) > 0 {
		// Save merge state for abort
		saveMergeState(gitDir, oursSHA, theirsSHA, branch)

		fmt.Println("Auto-merging failed. Fix conflicts and then commit the result.")
		fmt.Println("Conflicts:")
		for _, path := range result.Conflicts {
			fmt.Printf("\t%s\n", path)
		}
		return fmt.Errorf("merge conflict")
	}

	if noCommit {
		fmt.Println("Automatic merge went well; stopped before committing as requested")
		return nil
	}

	// Create merge commit
	return createMergeCommit(gitDir, oursSHA, theirsSHA, branch)
}

func fastForwardMerge(gitDir, workTree, branch, theirsSHA string) error {
	if err := updateWorkTree(gitDir, workTree, theirsSHA); err != nil {
		return err
	}

	if err := refs.UpdateCurrentBranch(gitDir, theirsSHA); err != nil {
		return err
	}

	fmt.Printf("Fast-forward to %s\n", theirsSHA[:7])
	return nil
}

func fastForwardNoCommit(gitDir, workTree, theirsSHA string) error {
	// Get the tree for the target commit
	treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, theirsSHA)
	if err != nil {
		return err
	}

	// Get files in target tree
	newFiles, err := objects.ReadTreeRecursive(gitDir, treeSHA, "")
	if err != nil {
		return err
	}

	// Read current index to compare
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get files in current index
	oldFiles := make(map[string]string)
	for _, entry := range idx.Entries {
		oldFiles[entry.Name] = entry.SHA
	}

	// Write new files to working tree and stage them
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

		// Add to index
		info, _ := os.Stat(fullPath)
		if info != nil {
			entry := index.CreateEntryFromFile(path, blobSHA, info)
			idx.AddEntry(entry)
		}
	}

	if err := index.WriteIndex(gitDir, idx); err != nil {
		return err
	}

	fmt.Println("Automatic merge went well; stopped before committing as requested")
	return nil
}

func createMergeCommit(gitDir, oursSHA, theirsSHA, branch string) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Build tree from index
	treeSHA, err := buildTreeFromIndex(gitDir, idx)
	if err != nil {
		return err
	}

	author := objects.GetAuthorString("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE")
	committer := objects.GetAuthorString("GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE")

	message := fmt.Sprintf("Merge branch '%s'", branch)

	commitData := objects.BuildCommit(treeSHA, []string{oursSHA, theirsSHA}, author, committer, message)
	commitSHA, err := objects.WriteObject(gitDir, objects.TypeCommit, commitData)
	if err != nil {
		return err
	}

	if err := refs.UpdateCurrentBranch(gitDir, commitSHA); err != nil {
		return err
	}

	fmt.Printf("Merge made by the 'recursive' strategy.\n")
	return nil
}

func saveMergeState(gitDir, oursSHA, theirsSHA, branch string) {
	mergeHead := filepath.Join(gitDir, "MERGE_HEAD")
	os.WriteFile(mergeHead, []byte(theirsSHA+"\n"), 0644)

	mergeMsg := filepath.Join(gitDir, "MERGE_MSG")
	os.WriteFile(mergeMsg, []byte(fmt.Sprintf("Merge branch '%s'\n", branch)), 0644)

	origHead := filepath.Join(gitDir, "ORIG_HEAD")
	os.WriteFile(origHead, []byte(oursSHA+"\n"), 0644)
}

func abortMerge(gitDir, workTree string) error {
	// Read ORIG_HEAD
	origHeadPath := filepath.Join(gitDir, "ORIG_HEAD")
	data, err := os.ReadFile(origHeadPath)
	if err != nil {
		return fmt.Errorf("no merge in progress")
	}

	origSHA := strings.TrimSpace(string(data))

	// Restore working tree
	if err := updateWorkTree(gitDir, workTree, origSHA); err != nil {
		return err
	}

	// Update HEAD
	if err := refs.UpdateCurrentBranch(gitDir, origSHA); err != nil {
		return err
	}

	// Clean up merge state files
	os.Remove(filepath.Join(gitDir, "MERGE_HEAD"))
	os.Remove(filepath.Join(gitDir, "MERGE_MSG"))
	os.Remove(filepath.Join(gitDir, "ORIG_HEAD"))

	fmt.Println("Merge aborted.")
	return nil
}
