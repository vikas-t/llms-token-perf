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
	// Parse flags
	writeObject := false
	objType := "blob"
	var filePath string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-w":
			writeObject = true
		case "-t":
			if i+1 < len(args) {
				objType = args[i+1]
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") {
				filePath = args[i]
			}
		}
	}

	if filePath == "" {
		return fmt.Errorf("file path required")
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	sha := utils.HashObject(objType, content)

	if writeObject {
		gitDir, err := utils.FindGitDir(".")
		if err != nil {
			return err
		}

		_, err = objects.WriteObject(gitDir, objType, content)
		if err != nil {
			return err
		}
	}

	fmt.Println(sha)
	return nil
}
