package cmd

import (
	"fmt"
	"minigit/refs"
	"minigit/utils"
	"os"
)

// SymbolicRef manages symbolic references
func SymbolicRef(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	if len(args) == 0 {
		return fmt.Errorf("usage: minigit symbolic-ref <ref> [<target>]")
	}

	ref := args[0]

	if len(args) == 1 {
		// Read symbolic ref
		target, err := refs.GetSymbolicRef(repoRoot, ref)
		if err != nil {
			return fmt.Errorf("fatal: ref %s is not a symbolic ref", ref)
		}
		fmt.Println(target)
		return nil
	}

	// Set symbolic ref
	target := args[1]
	return refs.SetSymbolicRef(repoRoot, ref, target)
}
