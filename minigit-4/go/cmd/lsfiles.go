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
	staged := false
	for _, arg := range args {
		switch arg {
		case "--staged", "-s", "--stage":
			staged = true
		}
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	entries := idx.GetSortedEntries()

	for _, entry := range entries {
		if staged {
			// Format: mode sha stage path
			fmt.Printf("%06o %s 0\t%s\n", entry.Mode, entry.SHA, entry.Name)
		} else {
			fmt.Println(entry.Name)
		}
	}

	return nil
}
