package pkg

import (
	"strings"
)

// IsBinary checks if content appears to be binary (contains null bytes)
func IsBinary(content string) bool {
	return strings.Contains(content, "\x00")
}

// NormalizeLineEndings converts all line endings to \n
func NormalizeLineEndings(content string) string {
	// First replace CRLF with LF
	content = strings.ReplaceAll(content, "\r\n", "\n")
	// Then replace remaining CR with LF
	content = strings.ReplaceAll(content, "\r", "\n")
	return content
}

// SplitLines splits content into lines, preserving empty trailing line if present
func SplitLines(content string) []string {
	if content == "" {
		return []string{}
	}

	lines := strings.Split(content, "\n")

	// If content ends with newline, the last element will be empty
	// Keep it to preserve trailing newline information
	return lines
}

// GetStats returns statistics from a diff result
func GetStats(diff DiffResult) DiffStats {
	return diff.Stats
}

// joinLines joins lines back into content
func joinLines(lines []string) string {
	return strings.Join(lines, "\n")
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
