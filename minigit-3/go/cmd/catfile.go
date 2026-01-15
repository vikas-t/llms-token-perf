package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"strings"
)

// CatFile examines object internals
func CatFile(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	if len(args) < 2 {
		return fmt.Errorf("usage: minigit cat-file (-t|-s|-p|<type>) <object>")
	}

	flag := args[0]
	object := args[1]

	// Handle special refs like HEAD^{tree}
	sha, err := refs.ResolveRef(repoRoot, object)
	if err != nil {
		return fmt.Errorf("fatal: Not a valid object name %s", object)
	}

	switch flag {
	case "-t":
		return catFileType(repoRoot, sha)
	case "-s":
		return catFileSize(repoRoot, sha)
	case "-p":
		return catFilePretty(repoRoot, sha)
	case "blob", "tree", "commit", "tag":
		return catFileRaw(repoRoot, sha, flag)
	default:
		return fmt.Errorf("unknown option: %s", flag)
	}
}

func catFileType(repoRoot, sha string) error {
	objType, _, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	fmt.Println(objType)
	return nil
}

func catFileSize(repoRoot, sha string) error {
	_, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	fmt.Println(len(content))
	return nil
}

func catFilePretty(repoRoot, sha string) error {
	objType, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	switch objType {
	case "blob":
		fmt.Print(string(content))
	case "tree":
		return printTree(repoRoot, content)
	case "commit":
		return printCommit(content)
	case "tag":
		return printTag(content)
	default:
		fmt.Print(string(content))
	}

	return nil
}

func catFileRaw(repoRoot, sha, expectedType string) error {
	objType, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}

	if objType != expectedType {
		return fmt.Errorf("expected %s, got %s", expectedType, objType)
	}

	fmt.Print(string(content))
	return nil
}

func printTree(repoRoot string, content []byte) error {
	entries, err := objects.ParseTree(content)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		objType := "blob"
		if entry.Mode == "40000" {
			objType = "tree"
		}

		// Pad mode to 6 characters
		mode := entry.Mode
		if len(mode) < 6 {
			mode = strings.Repeat("0", 6-len(mode)) + mode
		}

		fmt.Printf("%s %s %s\t%s\n", mode, objType, entry.SHA, entry.Name)
	}

	return nil
}

func printCommit(content []byte) error {
	fmt.Print(string(content))
	return nil
}

func printTag(content []byte) error {
	fmt.Print(string(content))
	return nil
}
