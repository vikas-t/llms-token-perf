package cmd

import (
	"fmt"
	"minigit/diff"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"strings"
)

// Show displays object content
func Show(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	ref := "HEAD"
	if len(args) > 0 {
		ref = args[0]
	}

	// Handle <commit>:<path> syntax
	if strings.Contains(ref, ":") && !strings.Contains(ref, "^{") {
		return showFileAtRef(gitDir, ref)
	}

	sha, err := refs.ResolveRef(gitDir, ref)
	if err != nil {
		return fmt.Errorf("unknown revision or path not in the working tree: %s", ref)
	}

	objType, data, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return err
	}

	switch objType {
	case objects.TypeCommit:
		return showCommit(gitDir, sha, data)
	case objects.TypeTree:
		return showTree(gitDir, data)
	case objects.TypeBlob:
		fmt.Print(string(data))
		return nil
	case objects.TypeTag:
		return showTag(gitDir, data)
	default:
		return fmt.Errorf("unknown object type: %s", objType)
	}
}

func showCommit(gitDir, sha string, data []byte) error {
	commit, err := objects.ParseCommit(data)
	if err != nil {
		return err
	}

	fmt.Printf("commit %s\n", sha)
	if len(commit.Parents) > 1 {
		fmt.Printf("Merge: %s %s\n", commit.Parents[0][:7], commit.Parents[1][:7])
	}
	fmt.Printf("Author: %s\n", formatAuthor(commit.Author))
	fmt.Printf("Date:   %s\n", formatDate(commit.Author))
	fmt.Println()
	for _, line := range strings.Split(commit.Message, "\n") {
		fmt.Printf("    %s\n", line)
	}
	fmt.Println()

	// Show diff from parent
	if len(commit.Parents) > 0 {
		return showCommitDiff(gitDir, commit.Parents[0], sha)
	} else {
		// First commit - show diff from empty tree
		return showFirstCommitDiff(gitDir, sha)
	}
}

func showCommitDiff(gitDir, parentSHA, commitSHA string) error {
	parentTree, err := objects.GetTreeSHAFromCommit(gitDir, parentSHA)
	if err != nil {
		return nil
	}

	commitTree, err := objects.GetTreeSHAFromCommit(gitDir, commitSHA)
	if err != nil {
		return nil
	}

	parentFiles, _ := objects.ReadTreeRecursive(gitDir, parentTree, "")
	commitFiles, _ := objects.ReadTreeRecursive(gitDir, commitTree, "")

	// Find all files
	allFiles := make(map[string]bool)
	for path := range parentFiles {
		allFiles[path] = true
	}
	for path := range commitFiles {
		allFiles[path] = true
	}

	for path := range allFiles {
		oldSHA := parentFiles[path]
		newSHA := commitFiles[path]

		if oldSHA == newSHA {
			continue
		}

		var oldContent, newContent []byte

		if oldSHA != "" {
			_, oldContent, _ = objects.ReadObject(gitDir, oldSHA)
		}
		if newSHA != "" {
			_, newContent, _ = objects.ReadObject(gitDir, newSHA)
		}

		result := diff.DiffFiles(path, path, oldContent, newContent)
		fmt.Print(diff.FormatUnifiedDiff(result))
	}

	return nil
}

func showFirstCommitDiff(gitDir, commitSHA string) error {
	commitTree, err := objects.GetTreeSHAFromCommit(gitDir, commitSHA)
	if err != nil {
		return nil
	}

	files, _ := objects.ReadTreeRecursive(gitDir, commitTree, "")

	for path, blobSHA := range files {
		_, content, err := objects.ReadObject(gitDir, blobSHA)
		if err != nil {
			continue
		}

		result := diff.DiffFiles("/dev/null", path, nil, content)
		fmt.Print(diff.FormatUnifiedDiff(result))
	}

	return nil
}

func showTree(gitDir string, data []byte) error {
	entries, err := objects.ParseTree(data)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		objType := "blob"
		if entry.Mode == "40000" {
			objType = "tree"
		}
		fmt.Printf("%s %s %s\t%s\n", entry.Mode, objType, entry.SHA, entry.Name)
	}

	return nil
}

func showTag(gitDir string, data []byte) error {
	tag, err := objects.ParseTag(data)
	if err != nil {
		return err
	}

	fmt.Printf("tag %s\n", tag.Name)
	fmt.Printf("Tagger: %s\n", formatAuthor(tag.Tagger))
	fmt.Println()
	fmt.Println(tag.Message)
	fmt.Println()

	// Show tagged object
	objType, objData, err := objects.ReadObject(gitDir, tag.Object)
	if err != nil {
		return err
	}

	if objType == objects.TypeCommit {
		return showCommit(gitDir, tag.Object, objData)
	}

	return nil
}

func showFileAtRef(gitDir, ref string) error {
	sha, err := refs.ResolveRef(gitDir, ref)
	if err != nil {
		return err
	}

	objType, data, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return err
	}

	if objType != objects.TypeBlob {
		return fmt.Errorf("not a file: %s", ref)
	}

	fmt.Print(string(data))
	return nil
}
