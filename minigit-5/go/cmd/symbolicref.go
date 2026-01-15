package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
)

// SymbolicRef manages symbolic references
func SymbolicRef(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	if len(args) == 0 {
		return fmt.Errorf("usage: symbolic-ref <ref> [<target>]")
	}

	refName := args[0]

	if len(args) == 1 {
		// Read symbolic ref
		target, err := refs.GetSymbolicRef(gitDir, refName)
		if err != nil {
			return err
		}
		fmt.Println(target)
		return nil
	}

	// Set symbolic ref
	target := args[1]
	return refs.SetSymbolicRef(gitDir, refName, target)
}
