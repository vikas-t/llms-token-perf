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
		return fmt.Errorf("revision required")
	}

	ref := args[0]

	sha, err := refs.ResolveRef(repoRoot, ref)
	if err != nil {
		return fmt.Errorf("unknown revision or path not in the working tree: %s", ref)
	}

	fmt.Println(sha)
	return nil
}
