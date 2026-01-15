package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"strings"
)

// LsTree lists tree contents
func LsTree(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	// Parse flags
	recursive := false
	nameOnly := false
	var treeish string

	for _, arg := range args {
		switch arg {
		case "-r":
			recursive = true
		case "--name-only":
			nameOnly = true
		default:
			if !strings.HasPrefix(arg, "-") {
				treeish = arg
			}
		}
	}

	if treeish == "" {
		return fmt.Errorf("tree-ish required")
	}

	// Resolve to tree SHA
	sha, err := refs.ResolveRef(gitDir, treeish)
	if err != nil {
		return err
	}

	// Get tree SHA if this is a commit
	objType, _, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return err
	}

	treeSHA := sha
	if objType == objects.TypeCommit {
		treeSHA, err = objects.GetTreeSHAFromCommit(gitDir, sha)
		if err != nil {
			return err
		}
	}

	return listTree(gitDir, treeSHA, "", recursive, nameOnly)
}

func listTree(gitDir, treeSHA, prefix string, recursive, nameOnly bool) error {
	_, data, err := objects.ReadObject(gitDir, treeSHA)
	if err != nil {
		return err
	}

	entries, err := objects.ParseTree(data)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		name := entry.Name
		if prefix != "" {
			name = prefix + "/" + entry.Name
		}

		objType := "blob"
		if entry.Mode == "40000" {
			objType = "tree"
		}

		if nameOnly {
			if objType == "tree" && recursive {
				// Skip directory entries when recursive, only show files
				listTree(gitDir, entry.SHA, name, recursive, nameOnly)
			} else if objType != "tree" {
				fmt.Println(name)
			}
		} else {
			// Pad mode to 6 chars
			mode := entry.Mode
			for len(mode) < 6 {
				mode = "0" + mode
			}

			if objType == "tree" && recursive {
				listTree(gitDir, entry.SHA, name, recursive, nameOnly)
			} else {
				fmt.Printf("%s %s %s\t%s\n", mode, objType, entry.SHA, name)
			}
		}
	}

	return nil
}
