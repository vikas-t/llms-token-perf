package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"strings"
)

// LsTree lists tree contents
func LsTree(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	recursive := false
	nameOnly := false
	var ref string

	for _, arg := range args {
		switch arg {
		case "-r":
			recursive = true
		case "--name-only":
			nameOnly = true
		default:
			if !strings.HasPrefix(arg, "-") && ref == "" {
				ref = arg
			}
		}
	}

	if ref == "" {
		return fmt.Errorf("tree reference required")
	}

	// Resolve to tree SHA
	treeSHA, err := resolveToTree(repoRoot, ref)
	if err != nil {
		return err
	}

	// List tree
	return listTree(repoRoot, treeSHA, "", recursive, nameOnly)
}

func resolveToTree(repoRoot, ref string) (string, error) {
	// Handle ^{tree} suffix
	if strings.HasSuffix(ref, "^{tree}") {
		ref = strings.TrimSuffix(ref, "^{tree}")
	}

	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return "", err
	}

	// Read object to determine type
	objType, data, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return "", err
	}

	switch objType {
	case objects.TreeType:
		return sha, nil
	case objects.CommitType:
		commit, err := objects.ParseCommit(data)
		if err != nil {
			return "", err
		}
		return commit.Tree, nil
	case objects.TagType:
		tag, err := objects.ParseTag(data)
		if err != nil {
			return "", err
		}
		return resolveToTree(repoRoot, tag.Object)
	}

	return "", fmt.Errorf("not a tree: %s", ref)
}

func listTree(repoRoot, treeSHA, prefix string, recursive, nameOnly bool) error {
	_, data, err := objects.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return err
	}

	entries, err := objects.ParseTree(data)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		entryType := "blob"
		if entry.Mode == 0040000 {
			entryType = "tree"
		}

		if entry.Mode == 0040000 && recursive {
			// Recurse into subtree
			if err := listTree(repoRoot, entry.SHA, path, recursive, nameOnly); err != nil {
				return err
			}
		} else {
			if nameOnly {
				fmt.Println(path)
			} else {
				fmt.Printf("%06o %s %s\t%s\n", entry.Mode, entryType, entry.SHA, path)
			}
		}
	}

	return nil
}
