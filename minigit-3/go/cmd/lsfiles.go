package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/utils"
	"os"
)

// LsFiles lists indexed files
func LsFiles(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	showStage := false
	for _, arg := range args {
		switch arg {
		case "-s", "--stage", "--staged":
			showStage = true
		}
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	for _, entry := range idx.Entries {
		if showStage {
			// Format: mode sha stage path
			fmt.Printf("%s %s 0\t%s\n", entry.ModeToString(), entry.GetSHAHex(), entry.Name)
		} else {
			fmt.Println(entry.Name)
		}
	}

	return nil
}
