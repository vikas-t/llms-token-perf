package cmd

import (
	"fmt"
	"os"
	"path/filepath"
)

// Init initializes a new minigit repository
func Init(args []string) error {
	var targetDir string

	if len(args) > 0 {
		targetDir = args[0]
	} else {
		var err error
		targetDir, err = os.Getwd()
		if err != nil {
			return err
		}
	}

	// Make absolute path
	absPath, err := filepath.Abs(targetDir)
	if err != nil {
		return err
	}
	targetDir = absPath

	minigitDir := filepath.Join(targetDir, ".minigit")

	// Check if already exists
	if _, err := os.Stat(minigitDir); err == nil {
		return fmt.Errorf("repository already exists: %s", minigitDir)
	}

	// Create directory structure
	dirs := []string{
		minigitDir,
		filepath.Join(minigitDir, "objects"),
		filepath.Join(minigitDir, "objects", "info"),
		filepath.Join(minigitDir, "objects", "pack"),
		filepath.Join(minigitDir, "refs"),
		filepath.Join(minigitDir, "refs", "heads"),
		filepath.Join(minigitDir, "refs", "tags"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("cannot create directory %s: %v", dir, err)
		}
	}

	// Create HEAD file
	headPath := filepath.Join(minigitDir, "HEAD")
	if err := os.WriteFile(headPath, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		return fmt.Errorf("cannot create HEAD: %v", err)
	}

	// Create empty config file
	configPath := filepath.Join(minigitDir, "config")
	if err := os.WriteFile(configPath, []byte(""), 0644); err != nil {
		return fmt.Errorf("cannot create config: %v", err)
	}

	fmt.Printf("Initialized empty minigit repository in %s\n", minigitDir)
	return nil
}
