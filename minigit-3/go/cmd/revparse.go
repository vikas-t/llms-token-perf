package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
	"os"
)

// RevParse resolves revision to SHA
func RevParse(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	if len(args) == 0 {
		return fmt.Errorf("usage: minigit rev-parse <revision>")
	}

	revision := args[0]

	sha, err := refs.ResolveRef(repoRoot, revision)
	if err != nil {
		return fmt.Errorf("fatal: ambiguous argument '%s': unknown revision or path not in the working tree", revision)
	}

	fmt.Println(sha)
	return nil
}
