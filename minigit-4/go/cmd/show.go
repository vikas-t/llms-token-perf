package cmd

import (
	"fmt"
	"minigit/diff"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"strings"
)

// Show shows object content
func Show(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	ref := "HEAD"
	if len(args) > 0 {
		ref = args[0]
	}

	// Handle special syntax for path
	if strings.Contains(ref, ":") {
		return showPath(repoRoot, ref)
	}

	// Resolve ref
	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return fmt.Errorf("unknown revision or path not in the working tree: %s", ref)
	}

	// Read object
	objType, data, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	switch objType {
	case objects.CommitType:
		return showCommit(repoRoot, sha, data)
	case objects.TreeType:
		return showTree(repoRoot, data)
	case objects.BlobType:
		fmt.Print(string(data))
		return nil
	case objects.TagType:
		return showTag(repoRoot, data)
	}

	return nil
}

func showPath(repoRoot, ref string) error {
	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return fmt.Errorf("path not found: %s", ref)
	}

	_, data, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	fmt.Print(string(data))
	return nil
}

func showCommit(repoRoot, sha string, data []byte) error {
	commit, err := objects.ParseCommit(data)
	if err != nil {
		return err
	}

	// Print commit info
	fmt.Printf("commit %s\n", sha)

	// Check for merge commit
	if len(commit.Parents) > 1 {
		var parentShorts []string
		for _, p := range commit.Parents {
			parentShorts = append(parentShorts, p[:7])
		}
		fmt.Printf("Merge: %s\n", strings.Join(parentShorts, " "))
	}

	// Parse author
	name, email, _ := parseAuthorLine(commit.Author)
	fmt.Printf("Author: %s <%s>\n", name, email)
	fmt.Println()

	// Message
	for _, line := range strings.Split(commit.Message, "\n") {
		fmt.Printf("    %s\n", line)
	}
	fmt.Println()

	// Show diff from parent
	if len(commit.Parents) > 0 {
		parentTree, _ := getCommitTreeFiles(repoRoot, commit.Parents[0])
		currentTree, _ := walkTree(repoRoot, commit.Tree, "")

		printTreeDiff(repoRoot, parentTree, currentTree)
	} else {
		// Initial commit - show all files as added
		currentTree, _ := walkTree(repoRoot, commit.Tree, "")
		printTreeDiff(repoRoot, nil, currentTree)
	}

	return nil
}

func showTree(repoRoot string, data []byte) error {
	entries, err := objects.ParseTree(data)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		entryType := "blob"
		if entry.Mode == 0040000 {
			entryType = "tree"
		}
		fmt.Printf("%06o %s %s\t%s\n", entry.Mode, entryType, entry.SHA, entry.Name)
	}

	return nil
}

func showTag(repoRoot string, data []byte) error {
	tag, err := objects.ParseTag(data)
	if err != nil {
		return err
	}

	fmt.Printf("tag %s\n", tag.Name)
	fmt.Printf("Tagger: %s\n", tag.Tagger)
	fmt.Println()
	fmt.Println(tag.Message)
	fmt.Println()

	// Show referenced object
	sha := tag.Object
	objType, objData, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return nil
	}

	fmt.Printf("commit %s\n", sha)
	if objType == objects.CommitType {
		commit, _ := objects.ParseCommit(objData)
		if commit != nil {
			name, email, _ := parseAuthorLine(commit.Author)
			fmt.Printf("Author: %s <%s>\n", name, email)
			fmt.Println()
			for _, line := range strings.Split(commit.Message, "\n") {
				fmt.Printf("    %s\n", line)
			}
		}
	}

	return nil
}

func printTreeDiff(repoRoot string, oldTree, newTree map[string]string) {
	if oldTree == nil {
		oldTree = make(map[string]string)
	}
	if newTree == nil {
		newTree = make(map[string]string)
	}

	// Find all files
	allFiles := make(map[string]bool)
	for f := range oldTree {
		allFiles[f] = true
	}
	for f := range newTree {
		allFiles[f] = true
	}

	for name := range allFiles {
		oldSHA := oldTree[name]
		newSHA := newTree[name]

		if oldSHA == newSHA {
			continue
		}

		var oldContent, newContent string

		if oldSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, oldSHA)
			if err == nil {
				oldContent = string(data)
			}
		}

		if newSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, newSHA)
			if err == nil {
				newContent = string(data)
			}
		}

		d := diff.DiffStrings(oldContent, newContent, "a/"+name, "b/"+name)
		if d != "" {
			fmt.Print(d)
		}
	}
}
