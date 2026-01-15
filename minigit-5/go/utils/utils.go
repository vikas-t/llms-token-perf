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

// HashObject computes the SHA-1 hash of an object with its header
func HashObject(objType string, data []byte) string {
	header := fmt.Sprintf("%s %d\x00", objType, len(data))
	content := append([]byte(header), data...)
	hash := sha1.Sum(content)
	return hex.EncodeToString(hash[:])
}

// CompressData compresses data using zlib
func CompressData(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	w := zlib.NewWriter(&buf)
	_, err := w.Write(data)
	if err != nil {
		return nil, err
	}
	err = w.Close()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// DecompressData decompresses zlib data
func DecompressData(data []byte) ([]byte, error) {
	r, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// FindGitDir finds the .minigit directory from current or parent dirs
func FindGitDir(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}

	for {
		gitDir := filepath.Join(dir, ".minigit")
		if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
			return gitDir, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("not a minigit repository")
		}
		dir = parent
	}
}

// GetWorkTree returns the working tree root from a .minigit dir
func GetWorkTree(gitDir string) string {
	return filepath.Dir(gitDir)
}

// WriteFile writes content to a file, creating parent directories if needed
func WriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(path, data, perm)
}

// ReadFile reads a file and returns its contents
func ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// FileExists checks if a file exists
func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// IsDir checks if a path is a directory
func IsDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// RelPath returns the relative path from base to target
func RelPath(base, target string) (string, error) {
	return filepath.Rel(base, target)
}

// NormalizePath converts path separators to forward slashes
func NormalizePath(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}

// IsValidBranchName checks if a branch name is valid
func IsValidBranchName(name string) bool {
	if name == "" || strings.HasPrefix(name, "-") || strings.HasPrefix(name, ".") {
		return false
	}
	if strings.Contains(name, "..") || strings.Contains(name, " ") {
		return false
	}
	if strings.ContainsAny(name, "~^:?*[\\") {
		return false
	}
	return true
}

// ExpandSHA expands a short SHA to full SHA by finding matching object
func ExpandSHA(gitDir, shortSHA string) (string, error) {
	if len(shortSHA) < 4 {
		return "", fmt.Errorf("SHA too short")
	}
	if len(shortSHA) == 40 {
		objPath := filepath.Join(gitDir, "objects", shortSHA[:2], shortSHA[2:])
		if FileExists(objPath) {
			return shortSHA, nil
		}
		return "", fmt.Errorf("object not found: %s", shortSHA)
	}

	prefix := shortSHA[:2]
	rest := shortSHA[2:]
	objDir := filepath.Join(gitDir, "objects", prefix)

	if !IsDir(objDir) {
		return "", fmt.Errorf("object not found: %s", shortSHA)
	}

	entries, err := os.ReadDir(objDir)
	if err != nil {
		return "", err
	}

	var matches []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), rest) {
			matches = append(matches, prefix+entry.Name())
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
