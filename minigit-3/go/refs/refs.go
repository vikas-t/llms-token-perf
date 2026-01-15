package refs

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// ResolveRef resolves a reference to a commit SHA
func ResolveRef(repoRoot, ref string) (string, error) {
	// Check if it's already a full SHA
	if len(ref) == 40 && isHex(ref) {
		return ref, nil
	}

	// Try to expand abbreviated SHA first
	if len(ref) >= 4 && isHex(ref) {
		expanded, err := utils.ExpandSHA(repoRoot, ref)
		if err == nil {
			return expanded, nil
		}
	}

	// Handle special refs
	if ref == "HEAD" {
		return ResolveHEAD(repoRoot)
	}

	// Handle tree refs like HEAD^{tree} - must check BEFORE parent refs
	if strings.Contains(ref, "^{") {
		return resolveObjectRef(repoRoot, ref)
	}

	// Handle parent refs like HEAD^, HEAD~2
	if strings.Contains(ref, "^") || strings.Contains(ref, "~") {
		return resolveParentRef(repoRoot, ref)
	}

	// Handle colon refs like HEAD:file.txt
	if strings.Contains(ref, ":") {
		return resolvePathRef(repoRoot, ref)
	}

	// Try as branch name
	branchPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", ref)
	if sha, err := readRefFile(branchPath); err == nil {
		return sha, nil
	}

	// Try as tag name
	tagPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "tags", ref)
	if sha, err := readRefFile(tagPath); err == nil {
		// Check if it's an annotated tag
		objType, content, err := utils.ReadObject(repoRoot, sha)
		if err == nil && objType == "tag" {
			tag, err := objects.ParseTag(content)
			if err == nil {
				return tag.Object, nil
			}
		}
		return sha, nil
	}

	// Try as general ref
	refPath := filepath.Join(utils.MinigitPath(repoRoot), ref)
	if sha, err := readRefFile(refPath); err == nil {
		return sha, nil
	}

	return "", fmt.Errorf("cannot resolve reference: %s", ref)
}

// ResolveHEAD resolves HEAD to a commit SHA
func ResolveHEAD(repoRoot string) (string, error) {
	headPath := filepath.Join(utils.MinigitPath(repoRoot), "HEAD")
	content, err := os.ReadFile(headPath)
	if err != nil {
		return "", fmt.Errorf("cannot read HEAD: %v", err)
	}

	headStr := strings.TrimSpace(string(content))

	// Check if it's a symbolic ref
	if strings.HasPrefix(headStr, "ref: ") {
		refPath := strings.TrimPrefix(headStr, "ref: ")
		return readRefFile(filepath.Join(utils.MinigitPath(repoRoot), refPath))
	}

	// It's a detached HEAD (direct SHA)
	if len(headStr) == 40 && isHex(headStr) {
		return headStr, nil
	}

	return "", fmt.Errorf("invalid HEAD format")
}

// GetCurrentBranch returns the current branch name or empty if detached
func GetCurrentBranch(repoRoot string) (string, error) {
	headPath := filepath.Join(utils.MinigitPath(repoRoot), "HEAD")
	content, err := os.ReadFile(headPath)
	if err != nil {
		return "", err
	}

	headStr := strings.TrimSpace(string(content))
	if strings.HasPrefix(headStr, "ref: refs/heads/") {
		return strings.TrimPrefix(headStr, "ref: refs/heads/"), nil
	}

	return "", nil // Detached HEAD
}

// UpdateRef updates a reference to point to a new SHA
func UpdateRef(repoRoot, ref, sha string) error {
	var refPath string

	if strings.HasPrefix(ref, "refs/") {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), ref)
	} else if ref == "HEAD" {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), "HEAD")
	} else {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", ref)
	}

	// Create parent directories
	if err := os.MkdirAll(filepath.Dir(refPath), 0755); err != nil {
		return err
	}

	return os.WriteFile(refPath, []byte(sha+"\n"), 0644)
}

// UpdateHEAD updates HEAD to point to a branch or SHA
func UpdateHEAD(repoRoot, target string, symbolic bool) error {
	headPath := filepath.Join(utils.MinigitPath(repoRoot), "HEAD")

	var content string
	if symbolic {
		content = fmt.Sprintf("ref: refs/heads/%s\n", target)
	} else if strings.HasPrefix(target, "refs/") {
		content = fmt.Sprintf("ref: %s\n", target)
	} else {
		content = target + "\n"
	}

	return os.WriteFile(headPath, []byte(content), 0644)
}

// ListBranches returns all branch names
func ListBranches(repoRoot string) ([]string, error) {
	headsDir := filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads")
	entries, err := os.ReadDir(headsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var branches []string
	for _, entry := range entries {
		if !entry.IsDir() {
			branches = append(branches, entry.Name())
		}
	}

	return branches, nil
}

// ListTags returns all tag names
func ListTags(repoRoot string) ([]string, error) {
	tagsDir := filepath.Join(utils.MinigitPath(repoRoot), "refs", "tags")
	entries, err := os.ReadDir(tagsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var tags []string
	for _, entry := range entries {
		if !entry.IsDir() {
			tags = append(tags, entry.Name())
		}
	}

	return tags, nil
}

// DeleteRef deletes a reference
func DeleteRef(repoRoot, ref string) error {
	var refPath string

	if strings.HasPrefix(ref, "refs/") {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), ref)
	} else {
		// Try as branch
		refPath = filepath.Join(utils.MinigitPath(repoRoot), "refs", "heads", ref)
	}

	return os.Remove(refPath)
}

// GetSymbolicRef returns the target of a symbolic reference
func GetSymbolicRef(repoRoot, ref string) (string, error) {
	var refPath string
	if ref == "HEAD" {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), "HEAD")
	} else {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), ref)
	}

	content, err := os.ReadFile(refPath)
	if err != nil {
		return "", err
	}

	str := strings.TrimSpace(string(content))
	if !strings.HasPrefix(str, "ref: ") {
		return "", fmt.Errorf("not a symbolic reference")
	}

	return strings.TrimPrefix(str, "ref: "), nil
}

// SetSymbolicRef sets a symbolic reference
func SetSymbolicRef(repoRoot, ref, target string) error {
	var refPath string
	if ref == "HEAD" {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), "HEAD")
	} else {
		refPath = filepath.Join(utils.MinigitPath(repoRoot), ref)
	}

	content := fmt.Sprintf("ref: %s\n", target)
	return os.WriteFile(refPath, []byte(content), 0644)
}

// Helper functions

func readRefFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sha := strings.TrimSpace(string(content))
	if len(sha) != 40 {
		return "", fmt.Errorf("invalid ref content")
	}
	return sha, nil
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func resolveParentRef(repoRoot, ref string) (string, error) {
	// Parse refs like HEAD^, HEAD~2, main~3^
	re := regexp.MustCompile(`^([^^~]+)([\^~].*)$`)
	matches := re.FindStringSubmatch(ref)
	if matches == nil {
		return "", fmt.Errorf("invalid parent reference: %s", ref)
	}

	baseSHA, err := ResolveRef(repoRoot, matches[1])
	if err != nil {
		return "", err
	}

	suffix := matches[2]
	return traverseParents(repoRoot, baseSHA, suffix)
}

func traverseParents(repoRoot, sha, suffix string) (string, error) {
	currentSHA := sha
	i := 0

	for i < len(suffix) {
		if suffix[i] == '^' {
			parentIdx := 1
			i++
			// Check for number after ^
			if i < len(suffix) && suffix[i] >= '0' && suffix[i] <= '9' {
				end := i
				for end < len(suffix) && suffix[end] >= '0' && suffix[end] <= '9' {
					end++
				}
				parentIdx, _ = strconv.Atoi(suffix[i:end])
				i = end
			}

			objType, content, err := utils.ReadObject(repoRoot, currentSHA)
			if err != nil {
				return "", err
			}
			if objType != "commit" {
				return "", fmt.Errorf("not a commit: %s", currentSHA)
			}

			commit, err := objects.ParseCommit(content)
			if err != nil {
				return "", err
			}

			if parentIdx == 0 {
				return currentSHA, nil
			}

			if len(commit.Parents) < parentIdx {
				return "", fmt.Errorf("no parent %d for commit %s", parentIdx, currentSHA[:7])
			}
			currentSHA = commit.Parents[parentIdx-1]

		} else if suffix[i] == '~' {
			i++
			count := 1
			if i < len(suffix) && suffix[i] >= '0' && suffix[i] <= '9' {
				end := i
				for end < len(suffix) && suffix[end] >= '0' && suffix[end] <= '9' {
					end++
				}
				count, _ = strconv.Atoi(suffix[i:end])
				i = end
			}

			for j := 0; j < count; j++ {
				objType, content, err := utils.ReadObject(repoRoot, currentSHA)
				if err != nil {
					return "", err
				}
				if objType != "commit" {
					return "", fmt.Errorf("not a commit: %s", currentSHA)
				}

				commit, err := objects.ParseCommit(content)
				if err != nil {
					return "", err
				}

				if len(commit.Parents) == 0 {
					return "", fmt.Errorf("no parent for commit %s", currentSHA[:7])
				}
				currentSHA = commit.Parents[0]
			}
		} else {
			break
		}
	}

	return currentSHA, nil
}

func resolveObjectRef(repoRoot, ref string) (string, error) {
	// Parse refs like HEAD^{tree}, HEAD^{commit}
	re := regexp.MustCompile(`^(.+)\^\{(\w+)\}$`)
	matches := re.FindStringSubmatch(ref)
	if matches == nil {
		return "", fmt.Errorf("invalid object reference: %s", ref)
	}

	sha, err := ResolveRef(repoRoot, matches[1])
	if err != nil {
		return "", err
	}

	targetType := matches[2]

	// Dereference until we get the target type
	for {
		objType, content, err := utils.ReadObject(repoRoot, sha)
		if err != nil {
			return "", err
		}

		if objType == targetType {
			return sha, nil
		}

		if objType == "commit" && targetType == "tree" {
			commit, err := objects.ParseCommit(content)
			if err != nil {
				return "", err
			}
			return commit.Tree, nil
		}

		if objType == "tag" {
			tag, err := objects.ParseTag(content)
			if err != nil {
				return "", err
			}
			sha = tag.Object
			continue
		}

		return "", fmt.Errorf("cannot convert %s to %s", objType, targetType)
	}
}

func resolvePathRef(repoRoot, ref string) (string, error) {
	// Parse refs like HEAD:file.txt
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid path reference: %s", ref)
	}

	commitSHA, err := ResolveRef(repoRoot, parts[0])
	if err != nil {
		return "", err
	}

	path := parts[1]

	// Get tree from commit
	objType, content, err := utils.ReadObject(repoRoot, commitSHA)
	if err != nil {
		return "", err
	}

	var treeSHA string
	if objType == "commit" {
		commit, err := objects.ParseCommit(content)
		if err != nil {
			return "", err
		}
		treeSHA = commit.Tree
	} else if objType == "tree" {
		treeSHA = commitSHA
	} else {
		return "", fmt.Errorf("not a commit or tree: %s", commitSHA)
	}

	// Walk the path
	return resolveTreePath(repoRoot, treeSHA, path)
}

func resolveTreePath(repoRoot, treeSHA, path string) (string, error) {
	if path == "" {
		return treeSHA, nil
	}

	_, content, err := utils.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return "", err
	}

	entries, err := objects.ParseTree(content)
	if err != nil {
		return "", err
	}

	parts := strings.SplitN(path, "/", 2)
	name := parts[0]

	for _, entry := range entries {
		if entry.Name == name {
			if len(parts) == 1 {
				return entry.SHA, nil
			}
			return resolveTreePath(repoRoot, entry.SHA, parts[1])
		}
	}

	return "", fmt.Errorf("path not found: %s", path)
}
