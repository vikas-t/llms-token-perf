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
		return fmt.Errorf("usage: minigit ls-tree [-r] [--name-only] <tree-ish>")
	}

	sha, err := refs.ResolveRef(repoRoot, treeish)
	if err != nil {
		return fmt.Errorf("fatal: Not a valid object name %s", treeish)
	}

	// If it's a commit, get its tree
	objType, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	var treeSHA string
	if objType == "commit" {
		commit, err := objects.ParseCommit(content)
		if err != nil {
			return err
		}
		treeSHA = commit.Tree
	} else if objType == "tree" {
		treeSHA = sha
	} else {
		return fmt.Errorf("not a tree object: %s", sha)
	}

	return listTree(repoRoot, treeSHA, "", recursive, nameOnly)
}

func listTree(repoRoot, treeSHA, prefix string, recursive, nameOnly bool) error {
	_, content, err := utils.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return err
	}

	entries, err := objects.ParseTree(content)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		isTree := entry.Mode == "40000"

		if recursive && isTree {
			// Recurse into subtree
			err := listTree(repoRoot, entry.SHA, path, recursive, nameOnly)
			if err != nil {
				return err
			}
		} else {
			if nameOnly {
				fmt.Println(path)
			} else {
				objType := "blob"
				if isTree {
					objType = "tree"
				}

				// Pad mode to 6 characters
				mode := entry.Mode
				if len(mode) < 6 {
					mode = strings.Repeat("0", 6-len(mode)) + mode
				}

				fmt.Printf("%s %s %s\t%s\n", mode, objType, entry.SHA, path)
			}
		}
	}

	return nil
}
