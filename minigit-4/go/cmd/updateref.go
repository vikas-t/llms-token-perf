package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
	"os"
)

// UpdateRef updates a reference
func UpdateRef(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	if len(args) < 2 {
		return fmt.Errorf("usage: update-ref <ref> <sha>")
	}

	ref := args[0]
	sha := args[1]

	// Validate SHA
	if len(sha) < 4 {
		return fmt.Errorf("invalid SHA: %s", sha)
	}

	return refs.UpdateRef(repoRoot, ref, sha)
}
