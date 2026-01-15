package refs

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
)

// GetHEAD returns the current HEAD reference
func GetHEAD(repoRoot string) (string, error) {
	headPath := filepath.Join(repoRoot, ".minigit", "HEAD")
	content, err := utils.ReadFile(headPath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(content)), nil
}

// SetHEAD sets the HEAD reference
func SetHEAD(repoRoot, target string) error {
	headPath := filepath.Join(repoRoot, ".minigit", "HEAD")
	return utils.WriteFile(headPath, []byte(target+"\n"), 0644)
}

// GetCurrentBranch returns the current branch name, or empty if detached
func GetCurrentBranch(repoRoot string) (string, error) {
	head, err := GetHEAD(repoRoot)
	if err != nil {
		return "", err
	}

	if strings.HasPrefix(head, "ref: ") {
		ref := strings.TrimPrefix(head, "ref: ")
		if strings.HasPrefix(ref, "refs/heads/") {
			return strings.TrimPrefix(ref, "refs/heads/"), nil
		}
		return ref, nil
	}

	return "", nil // Detached HEAD
}

// ResolveRef resolves a reference to a SHA
func ResolveRef(repoRoot, ref string) (string, error) {
	// Handle special refs
	if ref == "HEAD" {
		head, err := GetHEAD(repoRoot)
		if err != nil {
			return "", err
		}
		if strings.HasPrefix(head, "ref: ") {
			return ResolveRef(repoRoot, strings.TrimPrefix(head, "ref: "))
		}
		return head, nil
	}

	// Handle parent notation
	if strings.Contains(ref, "^") || strings.Contains(ref, "~") {
		return resolveParentRef(repoRoot, ref)
	}

	// Handle tree-ish notation
	if strings.HasSuffix(ref, "^{tree}") {
		baseRef := strings.TrimSuffix(ref, "^{tree}")
		sha, err := ResolveRef(repoRoot, baseRef)
		if err != nil {
			return "", err
		}
		return objects.GetTreeSHA(repoRoot, sha)
	}

	// Handle commit:path notation
	if strings.Contains(ref, ":") {
		parts := strings.SplitN(ref, ":", 2)
		commitRef := parts[0]
		path := parts[1]
		return resolvePathRef(repoRoot, commitRef, path)
	}

	// Check if it's a SHA
	if utils.IsValidSHA(ref) {
		return objects.ExpandSHA(repoRoot, ref)
	}

	// Check branches
	branchPath := filepath.Join(repoRoot, ".minigit", "refs", "heads", ref)
	if utils.FileExists(branchPath) {
		content, err := utils.ReadFile(branchPath)
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(content)), nil
	}

	// Check tags
	tagPath := filepath.Join(repoRoot, ".minigit", "refs", "tags", ref)
	if utils.FileExists(tagPath) {
		content, err := utils.ReadFile(tagPath)
		if err != nil {
			return "", err
		}
		sha := strings.TrimSpace(string(content))
		// Check if it's an annotated tag
		objType, data, err := objects.ReadObject(repoRoot, sha)
		if err != nil {
			return sha, nil
		}
		if objType == objects.TagType {
			tag, err := objects.ParseTag(data)
			if err != nil {
				return sha, nil
			}
			return tag.Object, nil
		}
		return sha, nil
	}

	// Check full ref path
	fullRefPath := filepath.Join(repoRoot, ".minigit", ref)
	if utils.FileExists(fullRefPath) {
		content, err := utils.ReadFile(fullRefPath)
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(content)), nil
	}

	return "", fmt.Errorf("unknown revision or path: %s", ref)
}

func resolveParentRef(repoRoot, ref string) (string, error) {
	// Handle ^
	if idx := strings.LastIndex(ref, "^"); idx != -1 {
		baseRef := ref[:idx]
		suffix := ref[idx+1:]

		sha, err := ResolveRef(repoRoot, baseRef)
		if err != nil {
			return "", err
		}

		parentNum := 1
		if suffix != "" && suffix != "{tree}" {
			fmt.Sscanf(suffix, "%d", &parentNum)
		}

		if strings.HasSuffix(ref, "^{tree}") {
			return objects.GetTreeSHA(repoRoot, sha)
		}

		objType, data, err := objects.ReadObject(repoRoot, sha)
		if err != nil {
			return "", err
		}
		if objType != objects.CommitType {
			return "", fmt.Errorf("not a commit: %s", sha)
		}
		commit, err := objects.ParseCommit(data)
		if err != nil {
			return "", err
		}
		if parentNum > len(commit.Parents) {
			return "", fmt.Errorf("commit has no parent %d", parentNum)
		}
		return commit.Parents[parentNum-1], nil
	}

	// Handle ~
	if idx := strings.LastIndex(ref, "~"); idx != -1 {
		baseRef := ref[:idx]
		suffix := ref[idx+1:]

		sha, err := ResolveRef(repoRoot, baseRef)
		if err != nil {
			return "", err
		}

		count := 1
		if suffix != "" {
			fmt.Sscanf(suffix, "%d", &count)
		}

		for i := 0; i < count; i++ {
			objType, data, err := objects.ReadObject(repoRoot, sha)
			if err != nil {
				return "", err
			}
			if objType != objects.CommitType {
				return "", fmt.Errorf("not a commit: %s", sha)
			}
			commit, err := objects.ParseCommit(data)
			if err != nil {
				return "", err
			}
			if len(commit.Parents) == 0 {
				return "", fmt.Errorf("commit has no parent")
			}
			sha = commit.Parents[0]
		}

		return sha, nil
	}

	return "", fmt.Errorf("invalid ref: %s", ref)
}

func resolvePathRef(repoRoot, commitRef, path string) (string, error) {
	sha, err := ResolveRef(repoRoot, commitRef)
	if err != nil {
		return "", err
	}

	treeSHA, err := objects.GetTreeSHA(repoRoot, sha)
	if err != nil {
		return "", err
	}

	// Navigate the tree
	parts := utils.SplitPath(path)
	currentSHA := treeSHA

	for _, part := range parts {
		_, data, err := objects.ReadObject(repoRoot, currentSHA)
		if err != nil {
			return "", err
		}

		entries, err := objects.ParseTree(data)
		if err != nil {
			return "", err
		}

		found := false
		for _, entry := range entries {
			if entry.Name == part {
				currentSHA = entry.SHA
				found = true
				break
			}
		}

		if !found {
			return "", fmt.Errorf("path not found: %s", path)
		}
	}

	return currentSHA, nil
}

// UpdateRef updates a reference
func UpdateRef(repoRoot, ref, sha string) error {
	var refPath string
	if strings.HasPrefix(ref, "refs/") {
		refPath = filepath.Join(repoRoot, ".minigit", ref)
	} else if ref == "HEAD" {
		refPath = filepath.Join(repoRoot, ".minigit", "HEAD")
		return utils.WriteFile(refPath, []byte(sha+"\n"), 0644)
	} else {
		refPath = filepath.Join(repoRoot, ".minigit", "refs", "heads", ref)
	}

	return utils.WriteFile(refPath, []byte(sha+"\n"), 0644)
}

// CreateBranch creates a new branch
func CreateBranch(repoRoot, name, sha string) error {
	branchPath := filepath.Join(repoRoot, ".minigit", "refs", "heads", name)
	if utils.FileExists(branchPath) {
		return fmt.Errorf("branch already exists: %s", name)
	}
	return utils.WriteFile(branchPath, []byte(sha+"\n"), 0644)
}

// DeleteBranch deletes a branch
func DeleteBranch(repoRoot, name string) error {
	branchPath := filepath.Join(repoRoot, ".minigit", "refs", "heads", name)
	if !utils.FileExists(branchPath) {
		return fmt.Errorf("branch not found: %s", name)
	}
	return os.Remove(branchPath)
}

// ListBranches returns all branch names
func ListBranches(repoRoot string) ([]string, error) {
	branchesDir := filepath.Join(repoRoot, ".minigit", "refs", "heads")
	if !utils.IsDir(branchesDir) {
		return nil, nil
	}

	var branches []string
	err := filepath.Walk(branchesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			rel, _ := filepath.Rel(branchesDir, path)
			branches = append(branches, rel)
		}
		return nil
	})
	return branches, err
}

// CreateTag creates a tag
func CreateTag(repoRoot, name, sha string) error {
	tagPath := filepath.Join(repoRoot, ".minigit", "refs", "tags", name)
	if utils.FileExists(tagPath) {
		return fmt.Errorf("tag already exists: %s", name)
	}
	return utils.WriteFile(tagPath, []byte(sha+"\n"), 0644)
}

// DeleteTag deletes a tag
func DeleteTag(repoRoot, name string) error {
	tagPath := filepath.Join(repoRoot, ".minigit", "refs", "tags", name)
	if !utils.FileExists(tagPath) {
		return fmt.Errorf("tag not found: %s", name)
	}
	return os.Remove(tagPath)
}

// ListTags returns all tag names
func ListTags(repoRoot string) ([]string, error) {
	tagsDir := filepath.Join(repoRoot, ".minigit", "refs", "tags")
	if !utils.IsDir(tagsDir) {
		return nil, nil
	}

	var tags []string
	entries, err := os.ReadDir(tagsDir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			tags = append(tags, entry.Name())
		}
	}
	return tags, nil
}

// GetSymbolicRef reads a symbolic reference
func GetSymbolicRef(repoRoot, name string) (string, error) {
	refPath := filepath.Join(repoRoot, ".minigit", name)
	content, err := utils.ReadFile(refPath)
	if err != nil {
		return "", err
	}

	target := strings.TrimSpace(string(content))
	if !strings.HasPrefix(target, "ref: ") {
		return "", fmt.Errorf("not a symbolic reference: %s", name)
	}

	return strings.TrimPrefix(target, "ref: "), nil
}

// SetSymbolicRef sets a symbolic reference
func SetSymbolicRef(repoRoot, name, target string) error {
	refPath := filepath.Join(repoRoot, ".minigit", name)
	return utils.WriteFile(refPath, []byte("ref: "+target+"\n"), 0644)
}

// IsDetachedHEAD checks if HEAD is detached
func IsDetachedHEAD(repoRoot string) (bool, error) {
	head, err := GetHEAD(repoRoot)
	if err != nil {
		return false, err
	}
	return !strings.HasPrefix(head, "ref: "), nil
}

// GetBranchSHA returns the SHA for a branch
func GetBranchSHA(repoRoot, branch string) (string, error) {
	branchPath := filepath.Join(repoRoot, ".minigit", "refs", "heads", branch)
	content, err := utils.ReadFile(branchPath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(content)), nil
}
