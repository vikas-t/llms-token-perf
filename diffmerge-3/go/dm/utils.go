package dm

import (
	"strings"
)

// IsBinary detects if content appears to be binary (contains null bytes)
func IsBinary(content string) bool {
	return strings.ContainsRune(content, '\x00')
}

// NormalizeLineEndings converts all line endings to \n
func NormalizeLineEndings(content string) string {
	// First replace CRLF with LF
	result := strings.ReplaceAll(content, "\r\n", "\n")
	// Then replace remaining CR with LF
	result = strings.ReplaceAll(result, "\r", "\n")
	return result
}

// SplitLines splits content into lines, preserving empty trailing line if present
func SplitLines(content string) []string {
	if content == "" {
		return []string{}
	}

	lines := []string{}
	start := 0
	for i := 0; i < len(content); i++ {
		if content[i] == '\n' {
			lines = append(lines, content[start:i+1])
			start = i + 1
		} else if content[i] == '\r' {
			if i+1 < len(content) && content[i+1] == '\n' {
				lines = append(lines, content[start:i+2])
				i++
				start = i + 1
			} else {
				lines = append(lines, content[start:i+1])
				start = i + 1
			}
		}
	}
	// Handle remaining content without newline
	if start < len(content) {
		lines = append(lines, content[start:])
	}

	return lines
}

// GetStats returns statistics from a diff result
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

// trimLine returns a line with leading/trailing whitespace trimmed
func trimLine(line string) string {
	// Remove line ending first
	line = strings.TrimRight(line, "\r\n")
	return strings.TrimSpace(line)
}
