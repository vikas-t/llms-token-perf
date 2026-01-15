package cmd

import (
	"fmt"
	"minigit/utils"
	"os"
	"path/filepath"
)

// Init initializes a new repository
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

	// Make dir absolute
	if !filepath.IsAbs(dir) {
		wd, err := os.Getwd()
		if err != nil {
			return err
		}
		dir = filepath.Join(wd, dir)
	}

	minigitDir := filepath.Join(dir, ".minigit")

	// Check if already exists
	if utils.IsDir(minigitDir) {
		return fmt.Errorf("repository already exists: %s", minigitDir)
	}

	// Create directory structure
	dirs := []string{
		minigitDir,
		filepath.Join(minigitDir, "objects"),
		filepath.Join(minigitDir, "objects", "pack"),
		filepath.Join(minigitDir, "objects", "info"),
		filepath.Join(minigitDir, "refs"),
		filepath.Join(minigitDir, "refs", "heads"),
		filepath.Join(minigitDir, "refs", "tags"),
	}

	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}

	// Create HEAD
	headPath := filepath.Join(minigitDir, "HEAD")
	if err := utils.WriteFile(headPath, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		return err
	}

	// Create config
	configPath := filepath.Join(minigitDir, "config")
	if err := utils.WriteFile(configPath, []byte(""), 0644); err != nil {
		return err
	}

	fmt.Printf("Initialized empty minigit repository in %s\n", minigitDir)
	return nil
}
