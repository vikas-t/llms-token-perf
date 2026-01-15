package refs

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
)

// ReadHEAD reads the HEAD reference
func ReadHEAD(gitDir string) (string, error) {
	headPath := filepath.Join(gitDir, "HEAD")
	data, err := os.ReadFile(headPath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// WriteHEAD writes the HEAD reference
func WriteHEAD(gitDir, content string) error {
	headPath := filepath.Join(gitDir, "HEAD")
	return os.WriteFile(headPath, []byte(content+"\n"), 0644)
}

// IsSymbolicRef checks if HEAD is a symbolic reference
func IsSymbolicRef(gitDir string) (bool, error) {
	head, err := ReadHEAD(gitDir)
	if err != nil {
		return false, err
	}
	return strings.HasPrefix(head, "ref: "), nil
}

// GetSymbolicRef returns the target of a symbolic reference
func GetSymbolicRef(gitDir, name string) (string, error) {
	var path string
	if name == "HEAD" {
		path = filepath.Join(gitDir, "HEAD")
	} else {
		path = filepath.Join(gitDir, name)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	content := strings.TrimSpace(string(data))
	if !strings.HasPrefix(content, "ref: ") {
		return "", fmt.Errorf("not a symbolic reference")
	}

	return strings.TrimPrefix(content, "ref: "), nil
}

// SetSymbolicRef sets a symbolic reference
func SetSymbolicRef(gitDir, name, target string) error {
	var path string
	if name == "HEAD" {
		path = filepath.Join(gitDir, "HEAD")
	} else {
		path = filepath.Join(gitDir, name)
	}

	return os.WriteFile(path, []byte("ref: "+target+"\n"), 0644)
}

// ReadRef reads a reference (could be symbolic or direct)
func ReadRef(gitDir, name string) (string, error) {
	// Try as full path first
	var path string
	if name == "HEAD" {
		path = filepath.Join(gitDir, "HEAD")
	} else if strings.HasPrefix(name, "refs/") {
		path = filepath.Join(gitDir, name)
	} else {
		// Try different prefixes
		for _, prefix := range []string{"refs/heads/", "refs/tags/", "refs/remotes/"} {
			p := filepath.Join(gitDir, prefix+name)
			if utils.FileExists(p) {
				path = p
				break
			}
		}
		if path == "" {
			path = filepath.Join(gitDir, "refs", "heads", name)
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	content := strings.TrimSpace(string(data))

	// Follow symbolic refs
	if strings.HasPrefix(content, "ref: ") {
		return ReadRef(gitDir, strings.TrimPrefix(content, "ref: "))
	}

	return content, nil
}

// WriteRef writes a reference
func WriteRef(gitDir, name, sha string) error {
	var path string
	if name == "HEAD" {
		path = filepath.Join(gitDir, "HEAD")
	} else if strings.HasPrefix(name, "refs/") {
		path = filepath.Join(gitDir, name)
	} else {
		path = filepath.Join(gitDir, "refs", "heads", name)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(path, []byte(sha+"\n"), 0644)
}

// DeleteRef deletes a reference
func DeleteRef(gitDir, name string) error {
	var path string
	if strings.HasPrefix(name, "refs/") {
		path = filepath.Join(gitDir, name)
	} else {
		path = filepath.Join(gitDir, "refs", "heads", name)
	}
	return os.Remove(path)
}

// GetCurrentBranch returns the current branch name (or "" if detached)
func GetCurrentBranch(gitDir string) (string, error) {
	head, err := ReadHEAD(gitDir)
	if err != nil {
		return "", err
	}

	if strings.HasPrefix(head, "ref: refs/heads/") {
		return strings.TrimPrefix(head, "ref: refs/heads/"), nil
	}

	return "", nil // Detached HEAD
}

// ResolveRef resolves a reference to its SHA
func ResolveRef(gitDir, ref string) (string, error) {
	// Check if it's already a SHA
	if len(ref) >= 4 && len(ref) <= 40 && isHex(ref) {
		return utils.ExpandSHA(gitDir, ref)
	}

	// Try HEAD
	if ref == "HEAD" {
		head, err := ReadHEAD(gitDir)
		if err != nil {
			return "", err
		}
		if strings.HasPrefix(head, "ref: ") {
			return ResolveRef(gitDir, strings.TrimPrefix(head, "ref: "))
		}
		return head, nil
	}

	// Handle tree suffix BEFORE ancestor check
	if strings.HasSuffix(ref, "^{tree}") {
		base := strings.TrimSuffix(ref, "^{tree}")
		sha, err := ResolveRef(gitDir, base)
		if err != nil {
			return "", err
		}
		return objects.GetTreeSHAFromCommit(gitDir, sha)
	}

	// Handle parent and ancestor syntax
	if strings.Contains(ref, "^") || strings.Contains(ref, "~") {
		return resolveAncestor(gitDir, ref)
	}

	// Handle :path syntax for files in trees
	if strings.Contains(ref, ":") {
		return resolvePathInTree(gitDir, ref)
	}

	// Try full ref path
	if strings.HasPrefix(ref, "refs/") {
		return ReadRef(gitDir, ref)
	}

	// Try branches
	sha, err := ReadRef(gitDir, "refs/heads/"+ref)
	if err == nil {
		return sha, nil
	}

	// Try tags
	sha, err = ReadRef(gitDir, "refs/tags/"+ref)
	if err == nil {
		return sha, nil
	}

	return "", fmt.Errorf("unknown revision: %s", ref)
}

func resolveAncestor(gitDir, ref string) (string, error) {
	// Handle ^ and ~ syntax
	var baseRef string
	var suffix string

	if idx := strings.Index(ref, "^{"); idx != -1 {
		// This is handled elsewhere
		return ResolveRef(gitDir, ref)
	}

	if idx := strings.Index(ref, "^"); idx != -1 {
		baseRef = ref[:idx]
		suffix = ref[idx:]
	} else if idx := strings.Index(ref, "~"); idx != -1 {
		baseRef = ref[:idx]
		suffix = ref[idx:]
	} else {
		return ResolveRef(gitDir, ref)
	}

	sha, err := ResolveRef(gitDir, baseRef)
	if err != nil {
		return "", err
	}

	// Process suffix
	for len(suffix) > 0 {
		if strings.HasPrefix(suffix, "^") {
			suffix = suffix[1:]
			n := 1
			if len(suffix) > 0 && suffix[0] >= '0' && suffix[0] <= '9' {
				n = int(suffix[0] - '0')
				suffix = suffix[1:]
			}
			sha, err = getNthParent(gitDir, sha, n)
			if err != nil {
				return "", err
			}
		} else if strings.HasPrefix(suffix, "~") {
			suffix = suffix[1:]
			n := 1
			numStr := ""
			for len(suffix) > 0 && suffix[0] >= '0' && suffix[0] <= '9' {
				numStr += string(suffix[0])
				suffix = suffix[1:]
			}
			if numStr != "" {
				fmt.Sscanf(numStr, "%d", &n)
			}
			for i := 0; i < n; i++ {
				sha, err = getNthParent(gitDir, sha, 1)
				if err != nil {
					return "", err
				}
			}
		} else {
			break
		}
	}

	return sha, nil
}

func getNthParent(gitDir, sha string, n int) (string, error) {
	objType, data, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return "", err
	}

	if objType != objects.TypeCommit {
		return "", fmt.Errorf("not a commit: %s", sha)
	}

	commit, err := objects.ParseCommit(data)
	if err != nil {
		return "", err
	}

	if n < 1 || n > len(commit.Parents) {
		return "", fmt.Errorf("no parent %d for commit %s", n, sha)
	}

	return commit.Parents[n-1], nil
}

func resolvePathInTree(gitDir, ref string) (string, error) {
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid path syntax: %s", ref)
	}

	treeish := parts[0]
	path := parts[1]

	// Resolve the treeish to a tree SHA
	sha, err := ResolveRef(gitDir, treeish)
	if err != nil {
		return "", err
	}

	treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, sha)
	if err != nil {
		return "", err
	}

	// Walk the tree to find the path
	return findPathInTree(gitDir, treeSHA, path)
}

func findPathInTree(gitDir, treeSHA, path string) (string, error) {
	if path == "" {
		return treeSHA, nil
	}

	path = strings.TrimPrefix(path, "/")
	parts := strings.SplitN(path, "/", 2)
	name := parts[0]
	rest := ""
	if len(parts) > 1 {
		rest = parts[1]
	}

	_, data, err := objects.ReadObject(gitDir, treeSHA)
	if err != nil {
		return "", err
	}

	entries, err := objects.ParseTree(data)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.Name == name {
			if rest == "" {
				return entry.SHA, nil
			}
			return findPathInTree(gitDir, entry.SHA, rest)
		}
	}

	return "", fmt.Errorf("path not found: %s", path)
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// ListBranches lists all branches
func ListBranches(gitDir string) ([]string, error) {
	headsDir := filepath.Join(gitDir, "refs", "heads")
	return listRefs(headsDir, "")
}

// ListTags lists all tags
func ListTags(gitDir string) ([]string, error) {
	tagsDir := filepath.Join(gitDir, "refs", "tags")
	return listRefs(tagsDir, "")
}

func listRefs(dir, prefix string) ([]string, error) {
	var refs []string

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	for _, entry := range entries {
		name := entry.Name()
		if prefix != "" {
			name = prefix + "/" + name
		}

		if entry.IsDir() {
			subRefs, err := listRefs(filepath.Join(dir, entry.Name()), name)
			if err != nil {
				return nil, err
			}
			refs = append(refs, subRefs...)
		} else {
			refs = append(refs, name)
		}
	}

	return refs, nil
}

// BranchExists checks if a branch exists
func BranchExists(gitDir, name string) bool {
	path := filepath.Join(gitDir, "refs", "heads", name)
	return utils.FileExists(path)
}

// TagExists checks if a tag exists
func TagExists(gitDir, name string) bool {
	path := filepath.Join(gitDir, "refs", "tags", name)
	return utils.FileExists(path)
}

// UpdateCurrentBranch updates the current branch to point to SHA
func UpdateCurrentBranch(gitDir, sha string) error {
	head, err := ReadHEAD(gitDir)
	if err != nil {
		return err
	}

	if strings.HasPrefix(head, "ref: ") {
		ref := strings.TrimPrefix(head, "ref: ")
		return WriteRef(gitDir, ref, sha)
	}

	// Detached HEAD
	return WriteHEAD(gitDir, sha)
}
