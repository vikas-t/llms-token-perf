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
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	// Parse flags
	deleteFlag := false
	forceDelete := false
	renameFlag := false
	verboseFlag := false
	var names []string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-d":
			deleteFlag = true
		case "-D":
			forceDelete = true
		case "-m":
			renameFlag = true
		case "-v", "--verbose":
			verboseFlag = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				names = append(names, args[i])
			}
		}
	}

	if deleteFlag || forceDelete {
		if len(names) == 0 {
			return fmt.Errorf("branch name required")
		}
		return deleteBranch(gitDir, names[0], forceDelete)
	}

	if renameFlag {
		if len(names) < 2 {
			return fmt.Errorf("old and new branch names required")
		}
		return renameBranch(gitDir, names[0], names[1])
	}

	if len(names) == 0 {
		return listBranches(gitDir, verboseFlag)
	}

	// Create new branch
	name := names[0]
	startPoint := "HEAD"
	if len(names) > 1 {
		startPoint = names[1]
	}

	return createBranch(gitDir, name, startPoint)
}

func listBranches(gitDir string, verbose bool) error {
	branches, err := refs.ListBranches(gitDir)
	if err != nil {
		return err
	}

	currentBranch, _ := refs.GetCurrentBranch(gitDir)

	sort.Strings(branches)

	for _, branch := range branches {
		marker := " "
		if branch == currentBranch {
			marker = "*"
		}

		if verbose {
			sha, err := refs.ResolveRef(gitDir, "refs/heads/"+branch)
			if err != nil {
				fmt.Printf("%s %s\n", marker, branch)
				continue
			}

			_, data, err := objects.ReadObject(gitDir, sha)
			if err != nil {
				fmt.Printf("%s %s %s\n", marker, branch, sha[:7])
				continue
			}

			commit, _ := objects.ParseCommit(data)
			msg := ""
			if commit != nil {
				msg = strings.Split(strings.TrimSpace(commit.Message), "\n")[0]
				if len(msg) > 50 {
					msg = msg[:47] + "..."
				}
			}
			fmt.Printf("%s %s %s %s\n", marker, branch, sha[:7], msg)
		} else {
			fmt.Printf("%s %s\n", marker, branch)
		}
	}

	return nil
}

func createBranch(gitDir, name, startPoint string) error {
	if !utils.IsValidBranchName(name) {
		return fmt.Errorf("invalid branch name: %s", name)
	}

	if refs.BranchExists(gitDir, name) {
		return fmt.Errorf("branch '%s' already exists", name)
	}

	sha, err := refs.ResolveRef(gitDir, startPoint)
	if err != nil {
		return fmt.Errorf("invalid start point: %s", startPoint)
	}

	return refs.WriteRef(gitDir, "refs/heads/"+name, sha)
}

func deleteBranch(gitDir, name string, force bool) error {
	currentBranch, _ := refs.GetCurrentBranch(gitDir)
	if name == currentBranch {
		return fmt.Errorf("cannot delete the branch '%s' which you are currently on", name)
	}

	if !refs.BranchExists(gitDir, name) {
		return fmt.Errorf("branch '%s' not found", name)
	}

	if !force {
		// Check if branch is merged
		branchSHA, _ := refs.ResolveRef(gitDir, "refs/heads/"+name)
		headSHA, _ := refs.ResolveRef(gitDir, "HEAD")

		if branchSHA != "" && headSHA != "" {
			isMerged, _ := isAncestor(gitDir, branchSHA, headSHA)
			if !isMerged {
				return fmt.Errorf("branch '%s' is not fully merged. Use -D to force delete", name)
			}
		}
	}

	refPath := filepath.Join(gitDir, "refs", "heads", name)
	if err := os.Remove(refPath); err != nil {
		return fmt.Errorf("failed to delete branch: %w", err)
	}

	fmt.Printf("Deleted branch %s\n", name)
	return nil
}

func renameBranch(gitDir, oldName, newName string) error {
	if !utils.IsValidBranchName(newName) {
		return fmt.Errorf("invalid branch name: %s", newName)
	}

	if !refs.BranchExists(gitDir, oldName) {
		return fmt.Errorf("branch '%s' not found", oldName)
	}

	if refs.BranchExists(gitDir, newName) {
		return fmt.Errorf("branch '%s' already exists", newName)
	}

	// Read old ref
	sha, err := refs.ResolveRef(gitDir, "refs/heads/"+oldName)
	if err != nil {
		return err
	}

	// Create new ref
	if err := refs.WriteRef(gitDir, "refs/heads/"+newName, sha); err != nil {
		return err
	}

	// Delete old ref
	oldPath := filepath.Join(gitDir, "refs", "heads", oldName)
	if err := os.Remove(oldPath); err != nil {
		return err
	}

	// Update HEAD if needed
	currentBranch, _ := refs.GetCurrentBranch(gitDir)
	if currentBranch == oldName {
		refs.SetSymbolicRef(gitDir, "HEAD", "refs/heads/"+newName)
	}

	return nil
}

func isAncestor(gitDir, ancestor, descendant string) (bool, error) {
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

		objType, data, err := objects.ReadObject(gitDir, current)
		if err != nil || objType != objects.TypeCommit {
			continue
		}

		commit, _ := objects.ParseCommit(data)
		if commit != nil {
			queue = append(queue, commit.Parents...)
		}
	}

	return false, nil
}
