package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"strings"
)

// CatFile examines object internals
func CatFile(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	// Parse flags
	showType := false
	showSize := false
	prettyPrint := false
	var objType string
	var objRef string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-t":
			showType = true
		case "-s":
			showSize = true
		case "-p":
			prettyPrint = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				if objRef == "" {
					objRef = args[i]
				}
			} else if args[i] == "blob" || args[i] == "tree" || args[i] == "commit" || args[i] == "tag" {
				objType = args[i]
			}
		}
	}

	// Handle "cat-file blob <sha>" syntax
	if !showType && !showSize && !prettyPrint && objType == "" && len(args) >= 2 {
		if args[0] == "blob" || args[0] == "tree" || args[0] == "commit" || args[0] == "tag" {
			objType = args[0]
			objRef = args[1]
		}
	}

	if objRef == "" {
		return fmt.Errorf("object reference required")
	}

	// Resolve reference
	sha, err := refs.ResolveRef(gitDir, objRef)
	if err != nil {
		return fmt.Errorf("bad object: %s", objRef)
	}

	if showType {
		return catFileType(gitDir, sha)
	}

	if showSize {
		return catFileSize(gitDir, sha)
	}

	if prettyPrint || objType != "" {
		return catFilePretty(gitDir, sha)
	}

	return fmt.Errorf("flag required: -t, -s, or -p")
}

func catFileType(gitDir, sha string) error {
	objType, err := objects.GetObjectType(gitDir, sha)
	if err != nil {
		return err
	}
	fmt.Println(objType)
	return nil
}

func catFileSize(gitDir, sha string) error {
	size, err := objects.GetObjectSize(gitDir, sha)
	if err != nil {
		return err
	}
	fmt.Println(size)
	return nil
}

func catFilePretty(gitDir, sha string) error {
	objType, data, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return err
	}

	switch objType {
	case objects.TypeBlob:
		fmt.Print(string(data))
	case objects.TypeTree:
		return prettyPrintTree(gitDir, data)
	case objects.TypeCommit:
		return prettyPrintCommit(data)
	case objects.TypeTag:
		return prettyPrintTag(data)
	default:
		fmt.Print(string(data))
	}

	return nil
}

func prettyPrintTree(gitDir string, data []byte) error {
	entries, err := objects.ParseTree(data)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		objType := "blob"
		if entry.Mode == "40000" {
			objType = "tree"
		}
		// Pad mode to 6 chars
		mode := entry.Mode
		for len(mode) < 6 {
			mode = "0" + mode
		}
		fmt.Printf("%s %s %s\t%s\n", mode, objType, entry.SHA, entry.Name)
	}

	return nil
}

func prettyPrintCommit(data []byte) error {
	fmt.Print(string(data))
	return nil
}

func prettyPrintTag(data []byte) error {
	fmt.Print(string(data))
	return nil
}
