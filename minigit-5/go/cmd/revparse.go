package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
)

// RevParse resolves revision to SHA
func RevParse(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	if len(args) == 0 {
		return fmt.Errorf("revision required")
	}

	ref := args[0]

	sha, err := refs.ResolveRef(gitDir, ref)
	if err != nil {
		return fmt.Errorf("unknown revision: %s", ref)
	}

	fmt.Println(sha)
	return nil
}
