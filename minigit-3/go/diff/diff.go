package diff

import (
	"fmt"
	"strings"
)

// DiffLine represents a line in a diff
type DiffLine struct {
	Type    string // "add", "delete", "context"
	Content string
	OldLine int
	NewLine int
}

// Hunk represents a diff hunk
type Hunk struct {
	OldStart  int
	OldCount  int
	NewStart  int
	NewCount  int
	Lines     []DiffLine
}

// FileDiff represents a diff for a single file
type FileDiff struct {
	OldPath string
	NewPath string
	OldMode string
	NewMode string
	Hunks   []Hunk
	Binary  bool
}

// Myers implements the Myers diff algorithm
func Myers(oldLines, newLines []string) []DiffLine {
	n := len(oldLines)
	m := len(newLines)

	if n == 0 && m == 0 {
		return nil
	}

	// Special case: completely new file
	if n == 0 {
		result := make([]DiffLine, m)
		for i, line := range newLines {
			result[i] = DiffLine{Type: "add", Content: line, NewLine: i + 1}
		}
		return result
	}

	// Special case: completely deleted file
	if m == 0 {
		result := make([]DiffLine, n)
		for i, line := range oldLines {
			result[i] = DiffLine{Type: "delete", Content: line, OldLine: i + 1}
		}
		return result
	}

	// Run Myers algorithm
	max := n + m
	v := make(map[int]int)
	v[1] = 0
	var trace []map[int]int

	for d := 0; d <= max; d++ {
		vCopy := make(map[int]int)
		for k, val := range v {
			vCopy[k] = val
		}
		trace = append(trace, vCopy)

		for k := -d; k <= d; k += 2 {
			var x int
			if k == -d || (k != d && v[k-1] < v[k+1]) {
				x = v[k+1]
			} else {
				x = v[k-1] + 1
			}
			y := x - k

			for x < n && y < m && oldLines[x] == newLines[y] {
				x++
				y++
			}

			v[k] = x

			if x >= n && y >= m {
				return backtrack(trace, oldLines, newLines, n, m)
			}
		}
	}

	// Should never reach here
	return nil
}

func backtrack(trace []map[int]int, oldLines, newLines []string, n, m int) []DiffLine {
	var result []DiffLine

	x := n
	y := m

	for d := len(trace) - 1; d >= 0; d-- {
		v := trace[d]
		k := x - y

		var prevK int
		if k == -d || (k != d && v[k-1] < v[k+1]) {
			prevK = k + 1
		} else {
			prevK = k - 1
		}

		prevX := v[prevK]
		prevY := prevX - prevK

		// Add diagonal (context) moves
		for x > prevX && y > prevY {
			x--
			y--
			result = append(result, DiffLine{
				Type:    "context",
				Content: oldLines[x],
				OldLine: x + 1,
				NewLine: y + 1,
			})
		}

		if d > 0 {
			if x == prevX {
				// Insertion
				y--
				result = append(result, DiffLine{
					Type:    "add",
					Content: newLines[y],
					NewLine: y + 1,
				})
			} else {
				// Deletion
				x--
				result = append(result, DiffLine{
					Type:    "delete",
					Content: oldLines[x],
					OldLine: x + 1,
				})
			}
		}
	}

	// Reverse the result
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result
}

// CreateHunks groups diff lines into hunks with context
func CreateHunks(lines []DiffLine, contextLines int) []Hunk {
	if len(lines) == 0 {
		return nil
	}

	var hunks []Hunk
	var currentHunk *Hunk

	for i, line := range lines {
		if line.Type != "context" {
			// Check if we need to start a new hunk
			if currentHunk == nil {
				// Start new hunk
				hunk := Hunk{
					OldStart: max(1, line.OldLine-contextLines),
					NewStart: max(1, line.NewLine-contextLines),
				}

				// Add context lines before
				for j := i - contextLines; j < i; j++ {
					if j >= 0 && lines[j].Type == "context" {
						hunk.Lines = append(hunk.Lines, lines[j])
					}
				}
				currentHunk = &hunk
			}

			currentHunk.Lines = append(currentHunk.Lines, line)
		} else if currentHunk != nil {
			// Check if this context line is within range of the hunk
			currentHunk.Lines = append(currentHunk.Lines, line)

			// Check if we should end the hunk (too many context lines)
			contextCount := 0
			for j := len(currentHunk.Lines) - 1; j >= 0 && currentHunk.Lines[j].Type == "context"; j-- {
				contextCount++
			}

			if contextCount > contextLines*2 {
				// End current hunk, remove excess context
				excess := contextCount - contextLines
				currentHunk.Lines = currentHunk.Lines[:len(currentHunk.Lines)-excess]

				// Calculate counts
				for _, l := range currentHunk.Lines {
					if l.Type == "delete" || l.Type == "context" {
						currentHunk.OldCount++
					}
					if l.Type == "add" || l.Type == "context" {
						currentHunk.NewCount++
					}
				}

				hunks = append(hunks, *currentHunk)
				currentHunk = nil
			}
		}
	}

	// Finalize last hunk
	if currentHunk != nil && len(currentHunk.Lines) > 0 {
		// Trim trailing context to contextLines
		contextCount := 0
		for j := len(currentHunk.Lines) - 1; j >= 0 && currentHunk.Lines[j].Type == "context"; j-- {
			contextCount++
		}
		if contextCount > contextLines {
			currentHunk.Lines = currentHunk.Lines[:len(currentHunk.Lines)-(contextCount-contextLines)]
		}

		for _, l := range currentHunk.Lines {
			if l.Type == "delete" || l.Type == "context" {
				currentHunk.OldCount++
			}
			if l.Type == "add" || l.Type == "context" {
				currentHunk.NewCount++
			}
		}

		hunks = append(hunks, *currentHunk)
	}

	return hunks
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// FormatUnifiedDiff formats a file diff in unified diff format
func FormatUnifiedDiff(diff *FileDiff) string {
	var sb strings.Builder

	if diff.Binary {
		sb.WriteString(fmt.Sprintf("Binary files %s and %s differ\n", diff.OldPath, diff.NewPath))
		return sb.String()
	}

	// File header
	oldPath := diff.OldPath
	newPath := diff.NewPath
	if oldPath == "" || oldPath == "/dev/null" {
		oldPath = "/dev/null"
	} else {
		oldPath = "a/" + oldPath
	}
	if newPath == "" || newPath == "/dev/null" {
		newPath = "/dev/null"
	} else {
		newPath = "b/" + newPath
	}

	sb.WriteString(fmt.Sprintf("diff --git a/%s b/%s\n", diff.OldPath, diff.NewPath))
	if diff.OldMode != "" && diff.NewMode != "" && diff.OldMode != diff.NewMode {
		sb.WriteString(fmt.Sprintf("old mode %s\n", diff.OldMode))
		sb.WriteString(fmt.Sprintf("new mode %s\n", diff.NewMode))
	}
	if diff.OldPath == "" || diff.OldPath == "/dev/null" {
		sb.WriteString(fmt.Sprintf("new file mode %s\n", diff.NewMode))
	}
	if diff.NewPath == "" || diff.NewPath == "/dev/null" {
		sb.WriteString(fmt.Sprintf("deleted file mode %s\n", diff.OldMode))
	}

	sb.WriteString(fmt.Sprintf("--- %s\n", oldPath))
	sb.WriteString(fmt.Sprintf("+++ %s\n", newPath))

	// Hunks
	for _, hunk := range diff.Hunks {
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			hunk.OldStart, hunk.OldCount, hunk.NewStart, hunk.NewCount))

		for _, line := range hunk.Lines {
			switch line.Type {
			case "add":
				sb.WriteString("+" + line.Content + "\n")
			case "delete":
				sb.WriteString("-" + line.Content + "\n")
			case "context":
				sb.WriteString(" " + line.Content + "\n")
			}
		}
	}

	return sb.String()
}

// IsBinaryContent checks if content appears to be binary
func IsBinaryContent(content []byte) bool {
	// Check for null bytes in first 8KB
	checkLen := len(content)
	if checkLen > 8192 {
		checkLen = 8192
	}
	for i := 0; i < checkLen; i++ {
		if content[i] == 0 {
			return true
		}
	}
	return false
}
