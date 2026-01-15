package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"sort"
	"strings"
)

// Branch manages branches
func Branch(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	deleteFlag := false
	forceDelete := false
	renameFlag := false
	verbose := false
	var branchNames []string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-d":
			deleteFlag = true
		case "-D":
			deleteFlag = true
			forceDelete = true
		case "-m":
			renameFlag = true
		case "-v", "--verbose":
			verbose = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				branchNames = append(branchNames, args[i])
			}
		}
	}

	if deleteFlag {
		if len(branchNames) == 0 {
			return fmt.Errorf("branch name required")
		}
		return deleteBranch(repoRoot, branchNames[0], forceDelete)
	}

	if renameFlag {
		if len(branchNames) < 2 {
			return fmt.Errorf("both old and new branch names required")
		}
		return renameBranch(repoRoot, branchNames[0], branchNames[1])
	}

	if len(branchNames) == 0 {
		// List branches
		return listBranches(repoRoot, verbose)
	}

	if len(branchNames) == 1 {
		// Create branch at HEAD
		return createBranch(repoRoot, branchNames[0], "HEAD")
	}

	// Create branch at specific commit
	return createBranch(repoRoot, branchNames[0], branchNames[1])
}

func listBranches(repoRoot string, verbose bool) error {
	branches, err := refs.ListBranches(repoRoot)
	if err != nil {
		return err
	}

	currentBranch, _ := refs.GetCurrentBranch(repoRoot)

	sort.Strings(branches)

	for _, branch := range branches {
		prefix := "  "
		if branch == currentBranch {
			prefix = "* "
		}

		if verbose {
			sha, err := refs.GetBranchSHA(repoRoot, branch)
			if err != nil {
				fmt.Printf("%s%s\n", prefix, branch)
				continue
			}

			message := ""
			_, data, err := objects.ReadObject(repoRoot, sha)
			if err == nil {
				commit, err := objects.ParseCommit(data)
				if err == nil {
					message = strings.SplitN(commit.Message, "\n", 2)[0]
				}
			}

			fmt.Printf("%s%-20s %s %s\n", prefix, branch, sha[:7], message)
		} else {
			fmt.Printf("%s%s\n", prefix, branch)
		}
	}

	return nil
}

func createBranch(repoRoot, name, startPoint string) error {
	// Validate branch name
	if !isValidBranchName(name) {
		return fmt.Errorf("invalid branch name: %s", name)
	}

	// Check if branch already exists
	branches, _ := refs.ListBranches(repoRoot)
	for _, b := range branches {
		if b == name {
			return fmt.Errorf("branch '%s' already exists", name)
		}
	}

	// Resolve start point
	sha, err := refs.ResolveRef(repoRoot, startPoint)
	if err != nil {
		return fmt.Errorf("not a valid start point: %s", startPoint)
	}

	// Verify it's a commit
	objType, _, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	if objType != objects.CommitType {
		return fmt.Errorf("not a commit: %s", startPoint)
	}

	return refs.CreateBranch(repoRoot, name, sha)
}

func deleteBranch(repoRoot, name string, force bool) error {
	// Check if it's the current branch
	currentBranch, _ := refs.GetCurrentBranch(repoRoot)
	if currentBranch == name {
		return fmt.Errorf("cannot delete the branch '%s' which you are currently on", name)
	}

	// Check if branch exists
	branches, _ := refs.ListBranches(repoRoot)
	found := false
	for _, b := range branches {
		if b == name {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("branch '%s' not found", name)
	}

	// TODO: Check if branch is merged (for non-force delete)
	if !force {
		// For now, just allow delete
	}

	return refs.DeleteBranch(repoRoot, name)
}

func renameBranch(repoRoot, oldName, newName string) error {
	// Validate new branch name
	if !isValidBranchName(newName) {
		return fmt.Errorf("invalid branch name: %s", newName)
	}

	// Check if old branch exists
	branches, _ := refs.ListBranches(repoRoot)
	found := false
	for _, b := range branches {
		if b == oldName {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("branch '%s' not found", oldName)
	}

	// Check if new branch already exists
	for _, b := range branches {
		if b == newName {
			return fmt.Errorf("branch '%s' already exists", newName)
		}
	}

	// Get old branch SHA
	sha, err := refs.GetBranchSHA(repoRoot, oldName)
	if err != nil {
		return err
	}

	// Create new branch
	if err := refs.CreateBranch(repoRoot, newName, sha); err != nil {
		return err
	}

	// Delete old branch
	if err := refs.DeleteBranch(repoRoot, oldName); err != nil {
		return err
	}

	// Update HEAD if we renamed the current branch
	currentBranch, _ := refs.GetCurrentBranch(repoRoot)
	if currentBranch == oldName {
		return refs.SetSymbolicRef(repoRoot, "HEAD", "refs/heads/"+newName)
	}

	return nil
}

func isValidBranchName(name string) bool {
	// Branch names cannot:
	// - Start with a dash
	// - Contain spaces
	// - Start with ".."
	// - Be empty

	if name == "" {
		return false
	}

	if strings.HasPrefix(name, "-") {
		return false
	}

	if strings.Contains(name, " ") {
		return false
	}

	if strings.HasPrefix(name, "..") {
		return false
	}

	// Cannot contain certain characters
	for _, c := range []string{"^", "~", ":", "?", "*", "[", "\\"} {
		if strings.Contains(name, c) {
			return false
		}
	}

	return true
}
