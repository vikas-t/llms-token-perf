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
		return fmt.Errorf("usage: minigit update-ref <ref> <sha>")
	}

	ref := args[0]
	sha := args[1]

	// Expand short SHA if needed
	if len(sha) < 40 {
		expanded, err := utils.ExpandSHA(repoRoot, sha)
		if err != nil {
			// Try to resolve as a ref
			expanded, err = refs.ResolveRef(repoRoot, sha)
			if err != nil {
				return fmt.Errorf("fatal: %s is not a valid SHA1", sha)
			}
		}
		sha = expanded
	}

	return refs.UpdateRef(repoRoot, ref, sha)
}
