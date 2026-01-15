package cmd

import (
	"fmt"
	"os"
	"path/filepath"
)

// Init initializes a new minigit repository
func Init(args []string) error {
	var dir string
	if len(args) > 0 {
		dir = args[0]
	} else {
		var err error
		dir, err = os.Getwd()
		if err != nil {
			return err
		}
	}

	gitDir := filepath.Join(dir, ".minigit")

	// Check if already exists
	if _, err := os.Stat(gitDir); err == nil {
		return fmt.Errorf("repository already exists")
	}

	// Create directory structure
	dirs := []string{
		gitDir,
		filepath.Join(gitDir, "objects"),
		filepath.Join(gitDir, "objects", "info"),
		filepath.Join(gitDir, "objects", "pack"),
		filepath.Join(gitDir, "refs"),
		filepath.Join(gitDir, "refs", "heads"),
		filepath.Join(gitDir, "refs", "tags"),
	}

	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", d, err)
		}
	}

	// Create HEAD pointing to main
	headPath := filepath.Join(gitDir, "HEAD")
	if err := os.WriteFile(headPath, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		return fmt.Errorf("failed to create HEAD: %w", err)
	}

	// Create empty config
	configPath := filepath.Join(gitDir, "config")
	if err := os.WriteFile(configPath, []byte(""), 0644); err != nil {
		return fmt.Errorf("failed to create config: %w", err)
	}

	fmt.Printf("Initialized empty minigit repository in %s\n", gitDir)
	return nil
}
