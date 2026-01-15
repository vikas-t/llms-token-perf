package utils

import (
	"bytes"
	"compress/zlib"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const MinigitDir = ".minigit"

// FindRepoRoot walks up from the current directory to find .minigit
func FindRepoRoot(startPath string) (string, error) {
	path, err := filepath.Abs(startPath)
	if err != nil {
		return "", err
	}

	for {
		minigitPath := filepath.Join(path, MinigitDir)
		if info, err := os.Stat(minigitPath); err == nil && info.IsDir() {
			return path, nil
		}

		parent := filepath.Dir(path)
		if parent == path {
			return "", fmt.Errorf("not a minigit repository (or any of the parent directories)")
		}
		path = parent
	}
}

// MinigitPath returns the path to the .minigit directory
func MinigitPath(repoRoot string) string {
	return filepath.Join(repoRoot, MinigitDir)
}

// ObjectPath returns the path to store an object given its SHA
func ObjectPath(repoRoot, sha string) string {
	return filepath.Join(MinigitPath(repoRoot), "objects", sha[:2], sha[2:])
}

// HashObject computes the SHA-1 hash of a git object
func HashObject(objType string, content []byte) string {
	header := fmt.Sprintf("%s %d\x00", objType, len(content))
	data := append([]byte(header), content...)
	hash := sha1.Sum(data)
	return hex.EncodeToString(hash[:])
}

// WriteObject writes an object to the object store
func WriteObject(repoRoot, objType string, content []byte) (string, error) {
	sha := HashObject(objType, content)

	objPath := ObjectPath(repoRoot, sha)
	if _, err := os.Stat(objPath); err == nil {
		return sha, nil // Object already exists
	}

	// Create directory if needed
	if err := os.MkdirAll(filepath.Dir(objPath), 0755); err != nil {
		return "", err
	}

	// Compress the object
	header := fmt.Sprintf("%s %d\x00", objType, len(content))
	data := append([]byte(header), content...)

	var buf bytes.Buffer
	w := zlib.NewWriter(&buf)
	if _, err := w.Write(data); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}

	// Write to file
	if err := os.WriteFile(objPath, buf.Bytes(), 0644); err != nil {
		return "", err
	}

	return sha, nil
}

// ReadObject reads and decompresses an object from the object store
func ReadObject(repoRoot, sha string) (string, []byte, error) {
	// Try to expand abbreviated SHA
	if len(sha) < 40 {
		expanded, err := ExpandSHA(repoRoot, sha)
		if err != nil {
			return "", nil, err
		}
		sha = expanded
	}

	objPath := ObjectPath(repoRoot, sha)
	compressed, err := os.ReadFile(objPath)
	if err != nil {
		return "", nil, fmt.Errorf("object not found: %s", sha)
	}

	r, err := zlib.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return "", nil, err
	}
	defer r.Close()

	data, err := io.ReadAll(r)
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

	objType := parts[0]
	content := data[nullIdx+1:]

	return objType, content, nil
}

// ExpandSHA expands an abbreviated SHA to full 40 characters
func ExpandSHA(repoRoot, shortSHA string) (string, error) {
	if len(shortSHA) >= 40 {
		return shortSHA, nil
	}

	if len(shortSHA) < 4 {
		return "", fmt.Errorf("SHA too short: %s", shortSHA)
	}

	objectsDir := filepath.Join(MinigitPath(repoRoot), "objects", shortSHA[:2])
	entries, err := os.ReadDir(objectsDir)
	if err != nil {
		return "", fmt.Errorf("object not found: %s", shortSHA)
	}

	prefix := shortSHA[2:]
	var matches []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), prefix) {
			matches = append(matches, shortSHA[:2]+entry.Name())
		}
	}

	if len(matches) == 0 {
		return "", fmt.Errorf("object not found: %s", shortSHA)
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("ambiguous SHA: %s", shortSHA)
	}

	return matches[0], nil
}

// RelativePath returns the path relative to the repo root
func RelativePath(repoRoot, path string) (string, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(repoRoot, absPath)
	if err != nil {
		return "", err
	}
	// Always use forward slashes for git paths
	return filepath.ToSlash(rel), nil
}

// NormalizePath normalizes a path for git (forward slashes)
func NormalizePath(path string) string {
	return filepath.ToSlash(path)
}

// GetEnvOrDefault returns the environment variable or a default value
func GetEnvOrDefault(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}
