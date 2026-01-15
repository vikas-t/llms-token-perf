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
	"time"
)

// Object types
const (
	TypeBlob   = "blob"
	TypeTree   = "tree"
	TypeCommit = "commit"
	TypeTag    = "tag"
)

// TreeEntry represents an entry in a tree object
type TreeEntry struct {
	Mode string
	Name string
	SHA  string
}

// Commit represents a parsed commit object
type Commit struct {
	Tree      string
	Parents   []string
	Author    string
	Committer string
	Message   string
}

// Tag represents a parsed tag object
type Tag struct {
	Object  string
	Type    string
	Name    string
	Tagger  string
	Message string
}

// WriteObject writes an object to the object store
func WriteObject(gitDir, objType string, data []byte) (string, error) {
	sha := utils.HashObject(objType, data)
	header := fmt.Sprintf("%s %d\x00", objType, len(data))
	content := append([]byte(header), data...)

	compressed, err := utils.CompressData(content)
	if err != nil {
		return "", err
	}

	objPath := filepath.Join(gitDir, "objects", sha[:2], sha[2:])
	if err := utils.WriteFile(objPath, compressed, 0644); err != nil {
		return "", err
	}

	return sha, nil
}

// ReadObject reads an object from the object store
func ReadObject(gitDir, sha string) (string, []byte, error) {
	fullSHA, err := utils.ExpandSHA(gitDir, sha)
	if err != nil {
		return "", nil, err
	}

	objPath := filepath.Join(gitDir, "objects", fullSHA[:2], fullSHA[2:])
	compressed, err := os.ReadFile(objPath)
	if err != nil {
		return "", nil, fmt.Errorf("object not found: %s", sha)
	}

	data, err := utils.DecompressData(compressed)
	if err != nil {
		return "", nil, err
	}

	// Parse header
	nullIdx := bytes.IndexByte(data, 0)
	if nullIdx == -1 {
		return "", nil, fmt.Errorf("invalid object format")
	}

	header := string(data[:nullIdx])
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 {
		return "", nil, fmt.Errorf("invalid object header")
	}

	return parts[0], data[nullIdx+1:], nil
}

// GetObjectType returns the type of an object
func GetObjectType(gitDir, sha string) (string, error) {
	objType, _, err := ReadObject(gitDir, sha)
	return objType, err
}

// GetObjectSize returns the size of an object's content
func GetObjectSize(gitDir, sha string) (int, error) {
	_, data, err := ReadObject(gitDir, sha)
	if err != nil {
		return 0, err
	}
	return len(data), nil
}

// ParseTree parses tree object data into entries
func ParseTree(data []byte) ([]TreeEntry, error) {
	var entries []TreeEntry
	i := 0

	for i < len(data) {
		// Find space after mode
		spaceIdx := bytes.IndexByte(data[i:], ' ')
		if spaceIdx == -1 {
			break
		}
		mode := string(data[i : i+spaceIdx])
		i += spaceIdx + 1

		// Find null after name
		nullIdx := bytes.IndexByte(data[i:], 0)
		if nullIdx == -1 {
			break
		}
		name := string(data[i : i+nullIdx])
		i += nullIdx + 1

		// Read 20-byte SHA
		if i+20 > len(data) {
			break
		}
		sha := hex.EncodeToString(data[i : i+20])
		i += 20

		entries = append(entries, TreeEntry{Mode: mode, Name: name, SHA: sha})
	}

	return entries, nil
}

// BuildTree builds a tree object from entries
func BuildTree(entries []TreeEntry) []byte {
	// Sort entries by name
	sort.Slice(entries, func(i, j int) bool {
		// Directories should be compared with trailing /
		nameI := entries[i].Name
		nameJ := entries[j].Name
		if entries[i].Mode == "40000" {
			nameI += "/"
		}
		if entries[j].Mode == "40000" {
			nameJ += "/"
		}
		return nameI < nameJ
	})

	var buf bytes.Buffer
	for _, entry := range entries {
		buf.WriteString(entry.Mode)
		buf.WriteByte(' ')
		buf.WriteString(entry.Name)
		buf.WriteByte(0)
		shaBytes, _ := hex.DecodeString(entry.SHA)
		buf.Write(shaBytes)
	}
	return buf.Bytes()
}

// ParseCommit parses commit object data
func ParseCommit(data []byte) (*Commit, error) {
	commit := &Commit{}
	lines := strings.Split(string(data), "\n")
	i := 0

	for i < len(lines) {
		line := lines[i]
		if line == "" {
			// Rest is message
			commit.Message = strings.Join(lines[i+1:], "\n")
			break
		}

		if strings.HasPrefix(line, "tree ") {
			commit.Tree = strings.TrimPrefix(line, "tree ")
		} else if strings.HasPrefix(line, "parent ") {
			commit.Parents = append(commit.Parents, strings.TrimPrefix(line, "parent "))
		} else if strings.HasPrefix(line, "author ") {
			commit.Author = strings.TrimPrefix(line, "author ")
		} else if strings.HasPrefix(line, "committer ") {
			commit.Committer = strings.TrimPrefix(line, "committer ")
		}
		i++
	}

	return commit, nil
}

// BuildCommit builds commit object data
func BuildCommit(tree string, parents []string, author, committer, message string) []byte {
	var buf bytes.Buffer
	buf.WriteString("tree " + tree + "\n")
	for _, parent := range parents {
		buf.WriteString("parent " + parent + "\n")
	}
	buf.WriteString("author " + author + "\n")
	buf.WriteString("committer " + committer + "\n")
	buf.WriteString("\n")
	buf.WriteString(message)
	return buf.Bytes()
}

// ParseTag parses tag object data
func ParseTag(data []byte) (*Tag, error) {
	tag := &Tag{}
	lines := strings.Split(string(data), "\n")
	i := 0

	for i < len(lines) {
		line := lines[i]
		if line == "" {
			tag.Message = strings.Join(lines[i+1:], "\n")
			break
		}

		if strings.HasPrefix(line, "object ") {
			tag.Object = strings.TrimPrefix(line, "object ")
		} else if strings.HasPrefix(line, "type ") {
			tag.Type = strings.TrimPrefix(line, "type ")
		} else if strings.HasPrefix(line, "tag ") {
			tag.Name = strings.TrimPrefix(line, "tag ")
		} else if strings.HasPrefix(line, "tagger ") {
			tag.Tagger = strings.TrimPrefix(line, "tagger ")
		}
		i++
	}

	return tag, nil
}

// BuildTag builds tag object data
func BuildTag(object, objType, name, tagger, message string) []byte {
	var buf bytes.Buffer
	buf.WriteString("object " + object + "\n")
	buf.WriteString("type " + objType + "\n")
	buf.WriteString("tag " + name + "\n")
	buf.WriteString("tagger " + tagger + "\n")
	buf.WriteString("\n")
	buf.WriteString(message)
	return buf.Bytes()
}

// GetAuthorString returns the author/committer string from environment
func GetAuthorString(envName, envEmail, envDate string) string {
	name := os.Getenv(envName)
	if name == "" {
		name = "Unknown"
	}
	email := os.Getenv(envEmail)
	if email == "" {
		email = "unknown@example.com"
	}

	dateStr := os.Getenv(envDate)
	var timestamp int64
	var tz string

	if dateStr != "" {
		// Try parsing ISO 8601 format
		t, err := time.Parse(time.RFC3339, dateStr)
		if err != nil {
			// Try Unix timestamp
			ts, err := strconv.ParseInt(dateStr, 10, 64)
			if err == nil {
				timestamp = ts
				tz = "+0000"
			} else {
				timestamp = time.Now().Unix()
				tz = "+0000"
			}
		} else {
			timestamp = t.Unix()
			_, offset := t.Zone()
			hours := offset / 3600
			mins := (offset % 3600) / 60
			if mins < 0 {
				mins = -mins
			}
			tz = fmt.Sprintf("%+03d%02d", hours, mins)
		}
	} else {
		timestamp = time.Now().Unix()
		tz = "+0000"
	}

	return fmt.Sprintf("%s <%s> %d %s", name, email, timestamp, tz)
}

// ReadTreeRecursive reads a tree and all its subtrees
func ReadTreeRecursive(gitDir, treeSHA, prefix string) (map[string]string, error) {
	files := make(map[string]string)

	_, data, err := ReadObject(gitDir, treeSHA)
	if err != nil {
		return nil, err
	}

	entries, err := ParseTree(data)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		if entry.Mode == "40000" {
			subFiles, err := ReadTreeRecursive(gitDir, entry.SHA, path)
			if err != nil {
				return nil, err
			}
			for k, v := range subFiles {
				files[k] = v
			}
		} else {
			files[path] = entry.SHA
		}
	}

	return files, nil
}

// GetTreeSHAFromCommit extracts tree SHA from a commit
func GetTreeSHAFromCommit(gitDir, commitSHA string) (string, error) {
	objType, data, err := ReadObject(gitDir, commitSHA)
	if err != nil {
		return "", err
	}

	if objType == TypeTag {
		tag, err := ParseTag(data)
		if err != nil {
			return "", err
		}
		return GetTreeSHAFromCommit(gitDir, tag.Object)
	}

	if objType != TypeCommit {
		return "", fmt.Errorf("not a commit: %s", commitSHA)
	}

	commit, err := ParseCommit(data)
	if err != nil {
		return "", err
	}

	return commit.Tree, nil
}
