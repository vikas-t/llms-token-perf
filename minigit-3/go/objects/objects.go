package objects

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"minigit/utils"
	"sort"
	"strconv"
	"strings"
	"time"
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
	TagName string
	Tagger  string
	Message string
}

// CreateBlob creates a blob object from content
func CreateBlob(repoRoot string, content []byte) (string, error) {
	return utils.WriteObject(repoRoot, "blob", content)
}

// CreateTree creates a tree object from entries
func CreateTree(repoRoot string, entries []TreeEntry) (string, error) {
	// Sort entries by name
	sort.Slice(entries, func(i, j int) bool {
		// Directories (mode 40000) sort after files of the same prefix
		return entries[i].Name < entries[j].Name
	})

	var buf bytes.Buffer
	for _, entry := range entries {
		sha, err := hex.DecodeString(entry.SHA)
		if err != nil {
			return "", fmt.Errorf("invalid SHA: %s", entry.SHA)
		}
		buf.WriteString(entry.Mode)
		buf.WriteByte(' ')
		buf.WriteString(entry.Name)
		buf.WriteByte(0)
		buf.Write(sha)
	}

	return utils.WriteObject(repoRoot, "tree", buf.Bytes())
}

// CreateCommit creates a commit object
func CreateCommit(repoRoot, treeSHA string, parents []string, message, author, committer string) (string, error) {
	var buf bytes.Buffer

	buf.WriteString(fmt.Sprintf("tree %s\n", treeSHA))
	for _, parent := range parents {
		buf.WriteString(fmt.Sprintf("parent %s\n", parent))
	}
	buf.WriteString(fmt.Sprintf("author %s\n", author))
	buf.WriteString(fmt.Sprintf("committer %s\n", committer))
	buf.WriteString("\n")
	buf.WriteString(message)
	if !strings.HasSuffix(message, "\n") {
		buf.WriteString("\n")
	}

	return utils.WriteObject(repoRoot, "commit", buf.Bytes())
}

// CreateTag creates an annotated tag object
func CreateTag(repoRoot, objectSHA, objectType, tagName, tagger, message string) (string, error) {
	var buf bytes.Buffer

	buf.WriteString(fmt.Sprintf("object %s\n", objectSHA))
	buf.WriteString(fmt.Sprintf("type %s\n", objectType))
	buf.WriteString(fmt.Sprintf("tag %s\n", tagName))
	buf.WriteString(fmt.Sprintf("tagger %s\n", tagger))
	buf.WriteString("\n")
	buf.WriteString(message)
	if !strings.HasSuffix(message, "\n") {
		buf.WriteString("\n")
	}

	return utils.WriteObject(repoRoot, "tag", buf.Bytes())
}

// ParseTree parses a tree object
func ParseTree(content []byte) ([]TreeEntry, error) {
	var entries []TreeEntry
	pos := 0

	for pos < len(content) {
		// Find space after mode
		spaceIdx := bytes.IndexByte(content[pos:], ' ')
		if spaceIdx == -1 {
			break
		}
		mode := string(content[pos : pos+spaceIdx])
		pos += spaceIdx + 1

		// Find null after name
		nullIdx := bytes.IndexByte(content[pos:], 0)
		if nullIdx == -1 {
			break
		}
		name := string(content[pos : pos+nullIdx])
		pos += nullIdx + 1

		// Read 20-byte SHA
		if pos+20 > len(content) {
			break
		}
		sha := hex.EncodeToString(content[pos : pos+20])
		pos += 20

		entries = append(entries, TreeEntry{
			Mode: mode,
			Name: name,
			SHA:  sha,
		})
	}

	return entries, nil
}

// ParseCommit parses a commit object
func ParseCommit(content []byte) (*Commit, error) {
	commit := &Commit{}

	lines := strings.Split(string(content), "\n")
	i := 0

	for i < len(lines) {
		line := lines[i]
		if line == "" {
			// Message starts after empty line
			commit.Message = strings.Join(lines[i+1:], "\n")
			break
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) < 2 {
			i++
			continue
		}

		switch parts[0] {
		case "tree":
			commit.Tree = parts[1]
		case "parent":
			commit.Parents = append(commit.Parents, parts[1])
		case "author":
			commit.Author = parts[1]
		case "committer":
			commit.Committer = parts[1]
		}
		i++
	}

	return commit, nil
}

// ParseTag parses a tag object
func ParseTag(content []byte) (*Tag, error) {
	tag := &Tag{}

	lines := strings.Split(string(content), "\n")
	i := 0

	for i < len(lines) {
		line := lines[i]
		if line == "" {
			tag.Message = strings.Join(lines[i+1:], "\n")
			break
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) < 2 {
			i++
			continue
		}

		switch parts[0] {
		case "object":
			tag.Object = parts[1]
		case "type":
			tag.Type = parts[1]
		case "tag":
			tag.TagName = parts[1]
		case "tagger":
			tag.Tagger = parts[1]
		}
		i++
	}

	return tag, nil
}

// FormatAuthor formats author/committer string with timestamp
func FormatAuthor(name, email string, date time.Time) string {
	// Format: Name <email> timestamp timezone
	timestamp := date.Unix()
	_, offset := date.Zone()
	offsetHours := offset / 3600
	offsetMins := (offset % 3600) / 60
	tzStr := fmt.Sprintf("%+03d%02d", offsetHours, offsetMins)
	if offsetMins < 0 {
		offsetMins = -offsetMins
	}
	return fmt.Sprintf("%s <%s> %d %s", name, email, timestamp, tzStr)
}

// ParseAuthorTime extracts the timestamp from an author/committer line
func ParseAuthorTime(authorLine string) (time.Time, error) {
	parts := strings.Split(authorLine, " ")
	if len(parts) < 2 {
		return time.Time{}, fmt.Errorf("invalid author line")
	}
	// Find the timestamp (second-to-last part)
	for i := len(parts) - 2; i >= 0; i-- {
		timestamp, err := strconv.ParseInt(parts[i], 10, 64)
		if err == nil {
			return time.Unix(timestamp, 0), nil
		}
	}
	return time.Time{}, fmt.Errorf("no timestamp found")
}

// GetObjectType returns the type of a git object
func GetObjectType(repoRoot, sha string) (string, error) {
	objType, _, err := utils.ReadObject(repoRoot, sha)
	return objType, err
}

// GetObjectSize returns the size of a git object's content
func GetObjectSize(repoRoot, sha string) (int, error) {
	_, content, err := utils.ReadObject(repoRoot, sha)
	if err != nil {
		return 0, err
	}
	return len(content), nil
}
