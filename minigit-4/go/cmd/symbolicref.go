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
		return fmt.Errorf("ref name required")
	}

	refName := args[0]

	if len(args) == 1 {
		// Read symbolic ref
		target, err := refs.GetSymbolicRef(repoRoot, refName)
		if err != nil {
			return err
		}
		fmt.Println(target)
		return nil
	}

	// Set symbolic ref
	target := args[1]
	return refs.SetSymbolicRef(repoRoot, refName, target)
}
