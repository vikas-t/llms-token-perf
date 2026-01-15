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

	target := "HEAD"
	if len(args) > 0 {
		target = args[0]
	}

	// Handle path ref like HEAD:file.txt
	if strings.Contains(target, ":") {
		return showPathRef(repoRoot, target)
	}

	sha, err := refs.ResolveRef(repoRoot, target)
	if err != nil {
		return fmt.Errorf("fatal: ambiguous argument '%s': unknown revision or path not in the working tree", target)
	}

	objType, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	switch objType {
	case "commit":
		return showCommit(repoRoot, sha, content)
	case "tree":
		return showTree(repoRoot, sha, content)
	case "blob":
		return showBlob(content)
	case "tag":
		return showTag(repoRoot, sha, content)
	default:
		return fmt.Errorf("unknown object type: %s", objType)
	}
}

func showPathRef(repoRoot, pathRef string) error {
	parts := strings.SplitN(pathRef, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid path reference: %s", pathRef)
	}

	commitRef := parts[0]
	path := parts[1]

	sha, err := refs.ResolveRef(repoRoot, commitRef)
	if err != nil {
		return err
	}

	treeSHA, err := getTreeFromCommit(repoRoot, sha)
	if err != nil {
		return err
	}

	files, err := flattenTreeToFiles(repoRoot, treeSHA, "")
	if err != nil {
		return err
	}

	fileSHA, ok := files[path]
	if !ok {
		return fmt.Errorf("fatal: path '%s' does not exist in '%s'", path, commitRef)
	}

	_, content, err := utils.ReadObject(repoRoot, fileSHA)
	if err != nil {
		return err
	}

	fmt.Print(string(content))
	return nil
}

func showCommit(repoRoot, sha string, content []byte) error {
	commit, err := objects.ParseCommit(content)
	if err != nil {
		return err
	}

	// Print commit header
	fmt.Printf("commit %s\n", sha)

	if len(commit.Parents) > 1 {
		parentStrs := make([]string, len(commit.Parents))
		for i, p := range commit.Parents {
			parentStrs[i] = p[:7]
		}
		fmt.Printf("Merge: %s\n", strings.Join(parentStrs, " "))
	}

	// Parse author
	authorParts := parseAuthorLine(commit.Author)
	fmt.Printf("Author: %s <%s>\n", authorParts["name"], authorParts["email"])

	// Parse date
	if timestamp, ok := authorParts["timestamp"]; ok {
		fmt.Printf("Date:   %s\n", formatTimestamp(timestamp))
	}

	fmt.Println()

	// Print message
	for _, line := range strings.Split(strings.TrimSpace(commit.Message), "\n") {
		fmt.Printf("    %s\n", line)
	}

	fmt.Println()

	// Show diff from parent
	if len(commit.Parents) > 0 {
		parentTree, err := getTreeFromCommit(repoRoot, commit.Parents[0])
		if err == nil {
			commitTree := commit.Tree
			showTreeDiff(repoRoot, parentTree, commitTree)
		}
	} else {
		// Initial commit - show all files as added
		commitTree := commit.Tree
		showTreeDiff(repoRoot, "", commitTree)
	}

	return nil
}

func showTree(repoRoot, sha string, content []byte) error {
	entries, err := objects.ParseTree(content)
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

func showBlob(content []byte) error {
	fmt.Print(string(content))
	return nil
}

func showTag(repoRoot, sha string, content []byte) error {
	tag, err := objects.ParseTag(content)
	if err != nil {
		return err
	}

	fmt.Printf("tag %s\n", tag.TagName)
	fmt.Printf("Tagger: %s\n", tag.Tagger)
	fmt.Println()
	fmt.Println(strings.TrimSpace(tag.Message))
	fmt.Println()

	// Show the tagged object
	return Show([]string{tag.Object})
}

func showTreeDiff(repoRoot, oldTree, newTree string) error {
	var oldFiles, newFiles map[string]string
	var err error

	if oldTree != "" {
		oldFiles, err = flattenTreeToFiles(repoRoot, oldTree, "")
		if err != nil {
			return err
		}
	} else {
		oldFiles = make(map[string]string)
	}

	newFiles, err = flattenTreeToFiles(repoRoot, newTree, "")
	if err != nil {
		return err
	}

	// Find all changed files
	for path, newSHA := range newFiles {
		oldSHA, existed := oldFiles[path]

		if !existed {
			// New file
			newContent, _ := getObjectContent(repoRoot, newSHA)
			d := createFileDiff("", path, nil, newContent, "", "100644")
			fmt.Print(diff.FormatUnifiedDiff(d))
		} else if oldSHA != newSHA {
			// Modified file
			oldContent, _ := getObjectContent(repoRoot, oldSHA)
			newContent, _ := getObjectContent(repoRoot, newSHA)
			d := createFileDiff(path, path, oldContent, newContent, "100644", "100644")
			fmt.Print(diff.FormatUnifiedDiff(d))
		}
	}

	// Deleted files
	for path, oldSHA := range oldFiles {
		if _, exists := newFiles[path]; !exists {
			oldContent, _ := getObjectContent(repoRoot, oldSHA)
			d := createFileDiff(path, "", oldContent, nil, "100644", "")
			fmt.Print(diff.FormatUnifiedDiff(d))
		}
	}

	return nil
}

func formatTimestamp(timestamp string) string {
	// Simple formatting
	return timestamp
}
