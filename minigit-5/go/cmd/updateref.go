package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
)

// UpdateRef updates a reference
func UpdateRef(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	if len(args) < 2 {
		return fmt.Errorf("usage: update-ref <ref> <sha>")
	}

	ref := args[0]
	sha := args[1]

	// Expand short SHA
	fullSHA, err := utils.ExpandSHA(gitDir, sha)
	if err != nil {
		// If not a valid SHA, check if it's a ref
		fullSHA, err = refs.ResolveRef(gitDir, sha)
		if err != nil {
			return fmt.Errorf("invalid reference or SHA: %s", sha)
		}
	}

	return refs.WriteRef(gitDir, ref, fullSHA)
}
