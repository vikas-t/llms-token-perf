package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"os"
	"strings"
)

// HashObject computes object hash
func HashObject(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		// Hash object can work without repo
		repoRoot = cwd
	}

	// Parse flags
	write := false
	objType := objects.BlobType
	var filePath string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-w":
			write = true
		case "-t":
			if i+1 < len(args) {
				objType = objects.ObjectType(args[i+1])
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") && filePath == "" {
				filePath = args[i]
			}
		}
	}

	if filePath == "" {
		return fmt.Errorf("file path required")
	}

	// Read file
	data, err := utils.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("could not read file: %s", filePath)
	}

	// Compute hash
	sha, err := objects.HashObject(repoRoot, objType, data, write)
	if err != nil {
		return err
	}

	fmt.Println(sha)
	return nil
}
