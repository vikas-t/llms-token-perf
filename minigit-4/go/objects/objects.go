package objects

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// ObjectType represents the type of a git object
type ObjectType string

const (
	BlobType   ObjectType = "blob"
	TreeType   ObjectType = "tree"
	CommitType ObjectType = "commit"
	TagType    ObjectType = "tag"
)

// TreeEntry represents an entry in a tree object
type TreeEntry struct {
	Mode uint32
	Name string
	SHA  string
}

// Commit represents a commit object
type Commit struct {
	Tree      string
	Parents   []string
	Author    string
	Committer string
	Message   string
}

// Tag represents a tag object
type Tag struct {
	Object  string
	ObjType string
	Name    string
	Tagger  string
	Message string
}

// HashObject computes the SHA for an object and optionally writes it
func HashObject(repoRoot string, objType ObjectType, data []byte, write bool) (string, error) {
	header := fmt.Sprintf("%s %d\x00", objType, len(data))
	content := append([]byte(header), data...)
	sha := utils.ComputeSHA1(content)

	if write {
		compressed, err := utils.CompressData(content)
		if err != nil {
			return "", err
		}
		objPath := utils.GetObjectPath(repoRoot, sha)
		if err := utils.WriteFile(objPath, compressed, 0644); err != nil {
			return "", err
		}
	}

	return sha, nil
}

// ReadObject reads an object from the object store
func ReadObject(repoRoot, sha string) (ObjectType, []byte, error) {
	// Try to expand short SHA
	fullSHA, err := ExpandSHA(repoRoot, sha)
	if err != nil {
		return "", nil, err
	}

	objPath := utils.GetObjectPath(repoRoot, fullSHA)
	compressed, err := utils.ReadFile(objPath)
	if err != nil {
		return "", nil, fmt.Errorf("object not found: %s", sha)
	}

	content, err := utils.DecompressData(compressed)
	if err != nil {
		return "", nil, err
	}

	// Parse header
	nullIdx := bytes.IndexByte(content, 0)
	if nullIdx == -1 {
		return "", nil, fmt.Errorf("invalid object format")
	}

	header := string(content[:nullIdx])
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 {
		return "", nil, fmt.Errorf("invalid object header")
	}

	objType := ObjectType(parts[0])
	data := content[nullIdx+1:]

	return objType, data, nil
}

// ExpandSHA expands a short SHA to full SHA
func ExpandSHA(repoRoot, sha string) (string, error) {
	if len(sha) == 40 {
		objPath := utils.GetObjectPath(repoRoot, sha)
		if utils.FileExists(objPath) {
			return sha, nil
		}
		return "", fmt.Errorf("object not found: %s", sha)
	}

	if len(sha) < 4 {
		return "", fmt.Errorf("SHA too short: %s", sha)
	}

	objectsDir := filepath.Join(repoRoot, ".minigit", "objects", sha[:2])
	if !utils.IsDir(objectsDir) {
		return "", fmt.Errorf("object not found: %s", sha)
	}

	entries, err := os.ReadDir(objectsDir)
	if err != nil {
		return "", err
	}

	prefix := sha[2:]
	var matches []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), prefix) {
			matches = append(matches, sha[:2]+entry.Name())
		}
	}

	if len(matches) == 0 {
		return "", fmt.Errorf("object not found: %s", sha)
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("ambiguous SHA: %s", sha)
	}

	return matches[0], nil
}

// WriteBlob writes a blob object and returns its SHA
func WriteBlob(repoRoot string, data []byte) (string, error) {
	return HashObject(repoRoot, BlobType, data, true)
}

// WriteTree writes a tree object from entries
func WriteTree(repoRoot string, entries []TreeEntry) (string, error) {
	// Sort entries by name
	sorted := make([]TreeEntry, len(entries))
	copy(sorted, entries)
	sort.Slice(sorted, func(i, j int) bool {
		// For sorting, directories (trees) should have "/" appended for comparison
		nameI := sorted[i].Name
		nameJ := sorted[j].Name
		if sorted[i].Mode == 0040000 {
			nameI += "/"
		}
		if sorted[j].Mode == 0040000 {
			nameJ += "/"
		}
		return nameI < nameJ
	})

	var buf bytes.Buffer
	for _, entry := range sorted {
		// Format: mode name\0sha
		mode := fmt.Sprintf("%o", entry.Mode)
		buf.WriteString(mode)
		buf.WriteByte(' ')
		buf.WriteString(entry.Name)
		buf.WriteByte(0)
		shaBytes, err := hex.DecodeString(entry.SHA)
		if err != nil {
			return "", err
		}
		buf.Write(shaBytes)
	}

	return HashObject(repoRoot, TreeType, buf.Bytes(), true)
}

// ParseTree parses tree data into entries
func ParseTree(data []byte) ([]TreeEntry, error) {
	var entries []TreeEntry
	pos := 0

	for pos < len(data) {
		// Find space after mode
		spaceIdx := bytes.IndexByte(data[pos:], ' ')
		if spaceIdx == -1 {
			return nil, fmt.Errorf("invalid tree format")
		}
		modeStr := string(data[pos : pos+spaceIdx])
		pos += spaceIdx + 1

		// Find null after name
		nullIdx := bytes.IndexByte(data[pos:], 0)
		if nullIdx == -1 {
			return nil, fmt.Errorf("invalid tree format")
		}
		name := string(data[pos : pos+nullIdx])
		pos += nullIdx + 1

		// Read 20-byte SHA
		if pos+20 > len(data) {
			return nil, fmt.Errorf("invalid tree format: missing SHA")
		}
		sha := hex.EncodeToString(data[pos : pos+20])
		pos += 20

		mode, _ := strconv.ParseUint(modeStr, 8, 32)
		entries = append(entries, TreeEntry{
			Mode: uint32(mode),
			Name: name,
			SHA:  sha,
		})
	}

	return entries, nil
}

// WriteCommit writes a commit object
func WriteCommit(repoRoot string, commit *Commit) (string, error) {
	var buf bytes.Buffer

	buf.WriteString(fmt.Sprintf("tree %s\n", commit.Tree))
	for _, parent := range commit.Parents {
		buf.WriteString(fmt.Sprintf("parent %s\n", parent))
	}
	buf.WriteString(fmt.Sprintf("author %s\n", commit.Author))
	buf.WriteString(fmt.Sprintf("committer %s\n", commit.Committer))
	buf.WriteString("\n")
	buf.WriteString(commit.Message)

	return HashObject(repoRoot, CommitType, buf.Bytes(), true)
}

// ParseCommit parses commit data
func ParseCommit(data []byte) (*Commit, error) {
	commit := &Commit{}
	lines := strings.SplitN(string(data), "\n\n", 2)
	if len(lines) < 2 {
		return nil, fmt.Errorf("invalid commit format")
	}

	headers := lines[0]
	commit.Message = lines[1]

	for _, line := range strings.Split(headers, "\n") {
		if strings.HasPrefix(line, "tree ") {
			commit.Tree = strings.TrimPrefix(line, "tree ")
		} else if strings.HasPrefix(line, "parent ") {
			commit.Parents = append(commit.Parents, strings.TrimPrefix(line, "parent "))
		} else if strings.HasPrefix(line, "author ") {
			commit.Author = strings.TrimPrefix(line, "author ")
		} else if strings.HasPrefix(line, "committer ") {
			commit.Committer = strings.TrimPrefix(line, "committer ")
		}
	}

	return commit, nil
}

// WriteTag writes an annotated tag object
func WriteTag(repoRoot string, tag *Tag) (string, error) {
	var buf bytes.Buffer

	buf.WriteString(fmt.Sprintf("object %s\n", tag.Object))
	buf.WriteString(fmt.Sprintf("type %s\n", tag.ObjType))
	buf.WriteString(fmt.Sprintf("tag %s\n", tag.Name))
	buf.WriteString(fmt.Sprintf("tagger %s\n", tag.Tagger))
	buf.WriteString("\n")
	buf.WriteString(tag.Message)

	return HashObject(repoRoot, TagType, buf.Bytes(), true)
}

// ParseTag parses tag data
func ParseTag(data []byte) (*Tag, error) {
	tag := &Tag{}
	lines := strings.SplitN(string(data), "\n\n", 2)
	if len(lines) < 2 {
		return nil, fmt.Errorf("invalid tag format")
	}

	headers := lines[0]
	tag.Message = lines[1]

	for _, line := range strings.Split(headers, "\n") {
		if strings.HasPrefix(line, "object ") {
			tag.Object = strings.TrimPrefix(line, "object ")
		} else if strings.HasPrefix(line, "type ") {
			tag.ObjType = strings.TrimPrefix(line, "type ")
		} else if strings.HasPrefix(line, "tag ") {
			tag.Name = strings.TrimPrefix(line, "tag ")
		} else if strings.HasPrefix(line, "tagger ") {
			tag.Tagger = strings.TrimPrefix(line, "tagger ")
		}
	}

	return tag, nil
}

// GetObjectType returns the type of an object
func GetObjectType(repoRoot, sha string) (ObjectType, error) {
	objType, _, err := ReadObject(repoRoot, sha)
	return objType, err
}

// GetObjectSize returns the size of an object
func GetObjectSize(repoRoot, sha string) (int, error) {
	_, data, err := ReadObject(repoRoot, sha)
	if err != nil {
		return 0, err
	}
	return len(data), nil
}

// PrettyPrint returns a pretty-printed representation of an object
func PrettyPrint(repoRoot, sha string) (string, error) {
	objType, data, err := ReadObject(repoRoot, sha)
	if err != nil {
		return "", err
	}

	switch objType {
	case BlobType:
		return string(data), nil
	case TreeType:
		entries, err := ParseTree(data)
		if err != nil {
			return "", err
		}
		var lines []string
		for _, entry := range entries {
			entryType := "blob"
			if entry.Mode == 0040000 {
				entryType = "tree"
			}
			lines = append(lines, fmt.Sprintf("%06o %s %s\t%s", entry.Mode, entryType, entry.SHA, entry.Name))
		}
		return strings.Join(lines, "\n"), nil
	case CommitType:
		return string(data), nil
	case TagType:
		return string(data), nil
	}

	return "", fmt.Errorf("unknown object type: %s", objType)
}

// GetTreeSHA returns the tree SHA from a commit or tree-ish
func GetTreeSHA(repoRoot, ref string) (string, error) {
	// Handle special syntax
	if strings.HasSuffix(ref, "^{tree}") {
		ref = strings.TrimSuffix(ref, "^{tree}")
	}

	objType, data, err := ReadObject(repoRoot, ref)
	if err != nil {
		return "", err
	}

	switch objType {
	case TreeType:
		// It's already a tree, return its SHA
		return ExpandSHA(repoRoot, ref)
	case CommitType:
		commit, err := ParseCommit(data)
		if err != nil {
			return "", err
		}
		return commit.Tree, nil
	case TagType:
		tag, err := ParseTag(data)
		if err != nil {
			return "", err
		}
		return GetTreeSHA(repoRoot, tag.Object)
	}

	return "", fmt.Errorf("not a tree-ish: %s", ref)
}
