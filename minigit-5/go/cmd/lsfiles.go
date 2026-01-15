package cmd

import (
	"fmt"
	"minigit/index"
	"minigit/utils"
	"strings"
)

// LsFiles lists indexed files
func LsFiles(args []string) error {
	gitDir, err := utils.FindGitDir(".")
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

	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	for _, entry := range idx.Entries {
		if staged {
			// Format: mode sha stage path
			mode := fmt.Sprintf("%o", entry.Mode)
			// Pad mode to 6 chars
			for len(mode) < 6 {
				mode = "0" + mode
			}
			fmt.Printf("%s %s 0\t%s\n", mode, entry.SHA, entry.Name)
		} else {
			fmt.Println(entry.Name)
		}
	}

	return nil
}

// Helper to check if a string starts with any prefix
func hasPrefix(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
