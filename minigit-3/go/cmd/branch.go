package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
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
	var positionalArgs []string

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
			positionalArgs = append(positionalArgs, args[i])
		}
	}

	if deleteFlag {
		if len(positionalArgs) == 0 {
			return fmt.Errorf("branch name required")
		}
		return deleteBranch(repoRoot, positionalArgs[0], forceDelete)
	}

	if renameFlag {
		if len(positionalArgs) < 2 {
			return fmt.Errorf("usage: minigit branch -m <old> <new>")
		}
		return renameBranch(repoRoot, positionalArgs[0], positionalArgs[1])
	}

	if len(positionalArgs) == 0 {
		return listBranches(repoRoot, verbose)
	}

	// Create new branch
	branchName := positionalArgs[0]
	var startPoint string
	if len(positionalArgs) > 1 {
		startPoint = positionalArgs[1]
	}

	return createBranch(repoRoot, branchName, startPoint)
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
			sha, err := refs.ResolveRef(repoRoot, branch)
			if err != nil {
				fmt.Printf("%s%s\n", prefix, branch)
				continue
			}

			objType, content, err := utils.ReadObject(repoRoot, sha)
			if err != nil || objType != "commit" {
				fmt.Printf("%s%s %s\n", prefix, branch, sha[:7])
				continue
			}

			commit, err := objects.ParseCommit(content)
			if err != nil {
				fmt.Printf("%s%s %s\n", prefix, branch, sha[:7])
				continue
			}

			msg := strings.TrimSpace(commit.Message)
			if idx := strings.Index(msg, "\n"); idx != -1 {
				msg = msg[:idx]
			}

			fmt.Printf("%s%s %s %s\n", prefix, branch, sha[:7], msg)
		} else {
			fmt.Printf("%s%s\n", prefix, branch)
		}
	}

	return nil
}

func createBranch(repoRoot, name, startPoint string) error {
	// Validate branch name
	if err := validateBranchName(name); err != nil {
		return err
	}

	// Check if branch already exists
	branchPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", name)
	if _, err := os.Stat(branchPath); err == nil {
		return fmt.Errorf("a branch named '%s' already exists", name)
	}

	// Get target commit
	var targetSHA string
	var err error

	if startPoint != "" {
		targetSHA, err = refs.ResolveRef(repoRoot, startPoint)
		if err != nil {
			return fmt.Errorf("not a valid object name: '%s'", startPoint)
		}
	} else {
		targetSHA, err = refs.ResolveHEAD(repoRoot)
		if err != nil {
			return fmt.Errorf("cannot create branch: no commits yet")
		}
	}

	// Create branch
	return refs.UpdateRef(repoRoot, "refs/heads/"+name, targetSHA)
}

func deleteBranch(repoRoot, name string, force bool) error {
	// Check if it's the current branch
	currentBranch, err := refs.GetCurrentBranch(repoRoot)
	if err == nil && currentBranch == name {
		return fmt.Errorf("cannot delete branch '%s' checked out", name)
	}

	// Check if branch exists
	branchPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", name)
	if _, err := os.Stat(branchPath); os.IsNotExist(err) {
		return fmt.Errorf("branch '%s' not found", name)
	}

	if !force {
		// Check if branch is merged into current branch
		branchSHA, err := refs.ResolveRef(repoRoot, name)
		if err != nil {
			return err
		}

		headSHA, err := refs.ResolveHEAD(repoRoot)
		if err == nil {
			merged, _ := isAncestor(repoRoot, branchSHA, headSHA)
			if !merged {
				return fmt.Errorf("branch '%s' is not fully merged. Use -D to force delete", name)
			}
		}
	}

	return refs.DeleteRef(repoRoot, name)
}

func renameBranch(repoRoot, oldName, newName string) error {
	// Validate new name
	if err := validateBranchName(newName); err != nil {
		return err
	}

	// Check if old branch exists
	oldPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", oldName)
	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		return fmt.Errorf("branch '%s' not found", oldName)
	}

	// Check if new branch already exists
	newPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", newName)
	if _, err := os.Stat(newPath); err == nil {
		return fmt.Errorf("a branch named '%s' already exists", newName)
	}

	// Get the SHA
	sha, err := refs.ResolveRef(repoRoot, oldName)
	if err != nil {
		return err
	}

	// Create new ref
	if err := refs.UpdateRef(repoRoot, "refs/heads/"+newName, sha); err != nil {
		return err
	}

	// Delete old ref
	if err := refs.DeleteRef(repoRoot, oldName); err != nil {
		return err
	}

	// Update HEAD if we're on the renamed branch
	currentBranch, _ := refs.GetCurrentBranch(repoRoot)
	if currentBranch == oldName {
		refs.UpdateHEAD(repoRoot, newName, true)
	}

	return nil
}

func validateBranchName(name string) error {
	if name == "" {
		return fmt.Errorf("branch name cannot be empty")
	}

	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("branch name cannot start with '-'")
	}

	if strings.Contains(name, "..") {
		return fmt.Errorf("branch name cannot contain '..'")
	}

	if strings.HasPrefix(name, ".") {
		return fmt.Errorf("branch name cannot start with '.'")
	}

	if strings.Contains(name, " ") {
		return fmt.Errorf("branch name cannot contain spaces")
	}

	// Check for invalid characters
	invalidChars := []string{"~", "^", ":", "?", "*", "[", "\\"}
	for _, c := range invalidChars {
		if strings.Contains(name, c) {
			return fmt.Errorf("branch name cannot contain '%s'", c)
		}
	}

	return nil
}

func isAncestor(repoRoot, ancestor, descendant string) (bool, error) {
	// BFS from descendant to find ancestor
	visited := make(map[string]bool)
	queue := []string{descendant}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current] {
			continue
		}
		visited[current] = true

		if current == ancestor {
			return true, nil
		}

		objType, content, err := utils.ReadObject(repoRoot, current)
		if err != nil || objType != "commit" {
			continue
		}

		commit, err := objects.ParseCommit(content)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	return false, nil
}
