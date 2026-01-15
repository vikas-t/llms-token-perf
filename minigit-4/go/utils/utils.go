package utils

import (
	"compress/zlib"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ComputeSHA1 computes SHA-1 hash of data and returns hex string
func ComputeSHA1(data []byte) string {
	h := sha1.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// CompressData compresses data using zlib
func CompressData(data []byte) ([]byte, error) {
	var buf strings.Builder
	w := zlib.NewWriter(&buf)
	_, err := w.Write(data)
	if err != nil {
		return nil, err
	}
	err = w.Close()
	if err != nil {
		return nil, err
	}
	return []byte(buf.String()), nil
}

// DecompressData decompresses zlib data
func DecompressData(data []byte) ([]byte, error) {
	r, err := zlib.NewReader(strings.NewReader(string(data)))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// FindRepoRoot finds the .minigit directory starting from current dir
func FindRepoRoot(startDir string) (string, error) {
	dir := startDir
	for {
		minigitPath := filepath.Join(dir, ".minigit")
		if info, err := os.Stat(minigitPath); err == nil && info.IsDir() {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("not a minigit repository (or any parent up to mount point)")
}

// GetMinigitDir returns the .minigit directory path
func GetMinigitDir(repoRoot string) string {
	return filepath.Join(repoRoot, ".minigit")
}

// GetObjectPath returns the path to an object file
func GetObjectPath(repoRoot, sha string) string {
	return filepath.Join(repoRoot, ".minigit", "objects", sha[:2], sha[2:])
}

// WriteFile writes data to a file, creating parent directories
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

// IsDir checks if path is a directory
func IsDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// RelPath returns the relative path from base to target
func RelPath(base, target string) (string, error) {
	return filepath.Rel(base, target)
}

// CleanPath normalizes a path (forward slashes, no trailing slash)
func CleanPath(path string) string {
	path = filepath.Clean(path)
	path = filepath.ToSlash(path)
	return path
}

// SplitPath splits a path into directory components
func SplitPath(path string) []string {
	path = CleanPath(path)
	if path == "" || path == "." {
		return []string{}
	}
	return strings.Split(path, "/")
}

// GetFileMode returns the git file mode for a file
func GetFileMode(path string) (uint32, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return 0, err
	}

	// Symlink
	if info.Mode()&os.ModeSymlink != 0 {
		return 0120000, nil
	}

	// Executable
	if info.Mode()&0111 != 0 {
		return 0100755, nil
	}

	// Regular file
	return 0100644, nil
}

// IsValidSHA checks if a string is a valid SHA-1 hex string
func IsValidSHA(s string) bool {
	if len(s) < 4 || len(s) > 40 {
		return false
	}
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}
