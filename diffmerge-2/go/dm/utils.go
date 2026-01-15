package dm

import (
	"strings"
)

// IsBinary detects if content appears to be binary (contains null bytes)
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

	// If the content ends with a newline, the last element will be empty
	// We want to return lines without that trailing empty element,
	// but we still track if there was a trailing newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	return lines
}

// GetStats computes statistics from a diff result
func GetStats(diff DiffResult) DiffStats {
	return diff.Stats
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
