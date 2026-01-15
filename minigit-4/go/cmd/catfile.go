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

	// Parse flags
	showType := false
	showSize := false
	prettyPrint := false
	var objType string
	var ref string

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
				if ref == "" {
					// Could be type or ref
					if args[i] == "blob" || args[i] == "tree" || args[i] == "commit" || args[i] == "tag" {
						objType = args[i]
					} else {
						ref = args[i]
					}
				} else {
					// This is a ref after type
					ref = args[i]
				}
			}
		}
	}

	if ref == "" {
		return fmt.Errorf("object reference required")
	}

	// Resolve ref
	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return fmt.Errorf("not a valid object name: %s", ref)
	}

	// Read object
	actualType, data, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return fmt.Errorf("object not found: %s", ref)
	}

	// Verify type if specified
	if objType != "" && string(actualType) != objType {
		// Still allow it, just warn
	}

	if showType {
		fmt.Println(actualType)
		return nil
	}

	if showSize {
		fmt.Println(len(data))
		return nil
	}

	if prettyPrint {
		return prettyPrintObject(repoRoot, sha, actualType, data)
	}

	// Raw content
	fmt.Print(string(data))
	return nil
}

func prettyPrintObject(repoRoot, sha string, objType objects.ObjectType, data []byte) error {
	switch objType {
	case objects.BlobType:
		fmt.Print(string(data))
	case objects.TreeType:
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
	case objects.CommitType:
		fmt.Print(string(data))
	case objects.TagType:
		fmt.Print(string(data))
	}
	return nil
}
