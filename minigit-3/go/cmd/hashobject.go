package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"os"
	"path/filepath"
)

// HashObject computes object hash
func HashObject(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	// Parse flags
	write := false
	objType := "blob"
	var filePath string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-w":
			write = true
		case "-t":
			if i+1 < len(args) {
				i++
				objType = args[i]
			}
		default:
			if filePath == "" {
				filePath = args[i]
			}
		}
	}

	if filePath == "" {
		return fmt.Errorf("usage: minigit hash-object [-w] [-t <type>] <file>")
	}

	// Make path absolute
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(cwd, filePath)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("fatal: Cannot open '%s': %v", filePath, err)
	}

	sha := utils.HashObject(objType, content)

	if write {
		repoRoot, err := utils.FindRepoRoot(cwd)
		if err != nil {
			return err
		}

		_, err = objects.CreateBlob(repoRoot, content)
		if err != nil {
			return err
		}
	}

	fmt.Println(sha)
	return nil
}
