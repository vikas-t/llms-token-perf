package diff

import (
	"fmt"
	"strings"
)

// Operation represents a diff operation
type Operation int

const (
	OpEqual Operation = iota
	OpInsert
	OpDelete
)

// Edit represents a single edit operation
type Edit struct {
	Op   Operation
	Text string
}

// Hunk represents a diff hunk
type Hunk struct {
	OldStart int
	OldCount int
	NewStart int
	NewCount int
	Lines    []Edit
}

// DiffResult represents the result of a diff
type DiffResult struct {
	OldPath string
	NewPath string
	Hunks   []Hunk
	Binary  bool
}

// ComputeDiff computes the diff between two strings
func ComputeDiff(old, new string) []Edit {
	oldLines := splitLines(old)
	newLines := splitLines(new)

	return computeLCS(oldLines, newLines)
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	// Remove trailing empty line if the string ended with newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// computeLCS uses LCS to compute the diff
func computeLCS(old, new []string) []Edit {
	n := len(old)
	m := len(new)

	if n == 0 && m == 0 {
		return nil
	}

	if n == 0 {
		edits := make([]Edit, m)
		for i, line := range new {
			edits[i] = Edit{Op: OpInsert, Text: line}
		}
		return edits
	}

	if m == 0 {
		edits := make([]Edit, n)
		for i, line := range old {
			edits[i] = Edit{Op: OpDelete, Text: line}
		}
		return edits
	}

	// Build LCS table
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}

	for i := 1; i <= n; i++ {
		for j := 1; j <= m; j++ {
			if old[i-1] == new[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}

	// Backtrack to build edits
	var edits []Edit
	i, j := n, m

	for i > 0 || j > 0 {
		if i > 0 && j > 0 && old[i-1] == new[j-1] {
			edits = append([]Edit{{Op: OpEqual, Text: old[i-1]}}, edits...)
			i--
			j--
		} else if j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]) {
			edits = append([]Edit{{Op: OpInsert, Text: new[j-1]}}, edits...)
			j--
		} else {
			edits = append([]Edit{{Op: OpDelete, Text: old[i-1]}}, edits...)
			i--
		}
	}

	return edits
}

// CreateHunks groups edits into hunks with context
func CreateHunks(edits []Edit, contextLines int) []Hunk {
	if len(edits) == 0 {
		return nil
	}

	// Check if there are any non-equal edits
	hasChanges := false
	for _, edit := range edits {
		if edit.Op != OpEqual {
			hasChanges = true
			break
		}
	}
	if !hasChanges {
		return nil
	}

	var hunks []Hunk
	var currentHunk *Hunk

	oldLine := 0
	newLine := 0

	for i, edit := range edits {
		switch edit.Op {
		case OpEqual:
			oldLine++
			newLine++

			if currentHunk != nil {
				// Check if we should include this context line
				needContext := false
				for j := i + 1; j < len(edits) && j <= i+contextLines; j++ {
					if edits[j].Op != OpEqual {
						needContext = true
						break
					}
				}

				if needContext || (i-findHunkStart(edits, i)) < contextLines+1 {
					currentHunk.Lines = append(currentHunk.Lines, edit)
					currentHunk.OldCount++
					currentHunk.NewCount++
				} else {
					// End current hunk
					hunks = append(hunks, *currentHunk)
					currentHunk = nil
				}
			}

		case OpDelete, OpInsert:
			if currentHunk == nil {
				// Start new hunk with context
				currentHunk = &Hunk{
					OldStart: oldLine + 1,
					NewStart: newLine + 1,
				}

				// Add leading context
				contextStart := max(0, i-contextLines)
				for j := contextStart; j < i; j++ {
					if edits[j].Op == OpEqual {
						currentHunk.Lines = append(currentHunk.Lines, edits[j])
						currentHunk.OldCount++
						currentHunk.NewCount++
						currentHunk.OldStart--
						currentHunk.NewStart--
					}
				}
			}

			currentHunk.Lines = append(currentHunk.Lines, edit)
			if edit.Op == OpDelete {
				oldLine++
				currentHunk.OldCount++
			} else {
				newLine++
				currentHunk.NewCount++
			}
		}
	}

	if currentHunk != nil {
		hunks = append(hunks, *currentHunk)
	}

	return hunks
}

func findHunkStart(edits []Edit, currentIdx int) int {
	// Find where the current hunk started
	for i := currentIdx - 1; i >= 0; i-- {
		if edits[i].Op != OpEqual {
			return i
		}
	}
	return 0
}

// FormatUnifiedDiff formats a diff result as unified diff
func FormatUnifiedDiff(result *DiffResult) string {
	if result.Binary {
		return fmt.Sprintf("Binary files %s and %s differ\n", result.OldPath, result.NewPath)
	}

	if len(result.Hunks) == 0 {
		return ""
	}

	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("--- %s\n", result.OldPath))
	sb.WriteString(fmt.Sprintf("+++ %s\n", result.NewPath))

	for _, hunk := range result.Hunks {
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			hunk.OldStart, hunk.OldCount, hunk.NewStart, hunk.NewCount))

		for _, edit := range hunk.Lines {
			switch edit.Op {
			case OpEqual:
				sb.WriteString(" " + edit.Text + "\n")
			case OpDelete:
				sb.WriteString("-" + edit.Text + "\n")
			case OpInsert:
				sb.WriteString("+" + edit.Text + "\n")
			}
		}
	}

	return sb.String()
}

// IsBinary checks if content appears to be binary
func IsBinary(content []byte) bool {
	// Check for null bytes in first 8000 bytes
	checkLen := 8000
	if len(content) < checkLen {
		checkLen = len(content)
	}

	for i := 0; i < checkLen; i++ {
		if content[i] == 0 {
			return true
		}
	}

	return false
}

// DiffFiles computes diff between two file contents
func DiffFiles(oldPath, newPath string, oldContent, newContent []byte) *DiffResult {
	result := &DiffResult{}

	if oldPath == "/dev/null" {
		result.OldPath = "/dev/null"
	} else {
		result.OldPath = "a/" + oldPath
	}

	if newPath == "/dev/null" {
		result.NewPath = "/dev/null"
	} else {
		result.NewPath = "b/" + newPath
	}

	if IsBinary(oldContent) || IsBinary(newContent) {
		result.Binary = true
		return result
	}

	edits := ComputeDiff(string(oldContent), string(newContent))
	result.Hunks = CreateHunks(edits, 3)

	return result
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
