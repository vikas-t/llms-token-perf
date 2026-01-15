package diff

import (
	"fmt"
	"strings"
)

// DiffLine represents a line in a diff
type DiffLine struct {
	Type    DiffType
	Content string
}

// DiffType represents the type of diff line
type DiffType int

const (
	Context DiffType = iota
	Add
	Remove
)

// Hunk represents a diff hunk
type Hunk struct {
	OldStart int
	OldCount int
	NewStart int
	NewCount int
	Lines    []DiffLine
}

// FileDiff represents the diff for a single file
type FileDiff struct {
	OldPath string
	NewPath string
	Hunks   []Hunk
	Binary  bool
}

// Myers implements Myers diff algorithm
func Myers(a, b []string) []DiffLine {
	n := len(a)
	m := len(b)

	if n == 0 && m == 0 {
		return nil
	}

	// Handle edge cases
	if n == 0 {
		var lines []DiffLine
		for _, line := range b {
			lines = append(lines, DiffLine{Type: Add, Content: line})
		}
		return lines
	}

	if m == 0 {
		var lines []DiffLine
		for _, line := range a {
			lines = append(lines, DiffLine{Type: Remove, Content: line})
		}
		return lines
	}

	// Build shortest edit script using Myers algorithm
	max := n + m
	v := make(map[int]int)
	v[1] = 0

	var trace []map[int]int

	for d := 0; d <= max; d++ {
		// Copy current v for trace
		vcopy := make(map[int]int)
		for k, val := range v {
			vcopy[k] = val
		}
		trace = append(trace, vcopy)

		for k := -d; k <= d; k += 2 {
			var x int
			if k == -d || (k != d && v[k-1] < v[k+1]) {
				x = v[k+1]
			} else {
				x = v[k-1] + 1
			}
			y := x - k

			// Follow diagonal
			for x < n && y < m && a[x] == b[y] {
				x++
				y++
			}

			v[k] = x

			if x >= n && y >= m {
				// Backtrack to find the path
				return backtrack(trace, a, b)
			}
		}
	}

	// Should not reach here
	return nil
}

func backtrack(trace []map[int]int, a, b []string) []DiffLine {
	x := len(a)
	y := len(b)

	var path []DiffLine

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

		// Follow diagonal backward
		for x > prevX && y > prevY {
			x--
			y--
			path = append([]DiffLine{{Type: Context, Content: a[x]}}, path...)
		}

		if d > 0 {
			if x == prevX {
				// Insert
				y--
				path = append([]DiffLine{{Type: Add, Content: b[y]}}, path...)
			} else {
				// Delete
				x--
				path = append([]DiffLine{{Type: Remove, Content: a[x]}}, path...)
			}
		}
	}

	return path
}

// GenerateHunks generates hunks from diff lines with context
func GenerateHunks(lines []DiffLine, contextLines int) []Hunk {
	if len(lines) == 0 {
		return nil
	}

	var hunks []Hunk
	var currentHunk *Hunk

	oldLine := 1
	newLine := 1

	for i, line := range lines {
		// Check if we need to start a new hunk
		needsNewHunk := currentHunk == nil

		if !needsNewHunk && line.Type == Context {
			// Count context lines after last change
			contextAfter := 0
			for j := i; j < len(lines) && lines[j].Type == Context; j++ {
				contextAfter++
			}

			// Check if there are more changes ahead
			hasMoreChanges := false
			for j := i + contextAfter; j < len(lines); j++ {
				if lines[j].Type != Context {
					hasMoreChanges = true
					break
				}
			}

			// If context gap is too large, start new hunk
			if hasMoreChanges && contextAfter > contextLines*2 {
				// Add trailing context to current hunk
				for j := 0; j < contextLines && i+j < len(lines); j++ {
					currentHunk.Lines = append(currentHunk.Lines, lines[i+j])
					currentHunk.OldCount++
					currentHunk.NewCount++
				}
				hunks = append(hunks, *currentHunk)

				// Skip context lines
				for j := 0; j < contextAfter-contextLines; j++ {
					oldLine++
					newLine++
				}

				currentHunk = nil
				needsNewHunk = true

				// Skip already processed context
				continue
			}
		}

		if needsNewHunk && line.Type != Context {
			// Start new hunk with leading context
			currentHunk = &Hunk{
				OldStart: oldLine - min(i, contextLines),
				NewStart: newLine - min(i, contextLines),
			}

			// Add leading context
			start := max(0, i-contextLines)
			for j := start; j < i; j++ {
				currentHunk.Lines = append(currentHunk.Lines, lines[j])
				currentHunk.OldCount++
				currentHunk.NewCount++
			}
		}

		if currentHunk != nil {
			currentHunk.Lines = append(currentHunk.Lines, line)
			switch line.Type {
			case Context:
				currentHunk.OldCount++
				currentHunk.NewCount++
			case Add:
				currentHunk.NewCount++
			case Remove:
				currentHunk.OldCount++
			}
		}

		// Update line numbers
		switch line.Type {
		case Context:
			oldLine++
			newLine++
		case Add:
			newLine++
		case Remove:
			oldLine++
		}
	}

	if currentHunk != nil && len(currentHunk.Lines) > 0 {
		hunks = append(hunks, *currentHunk)
	}

	return hunks
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// FormatUnifiedDiff formats a file diff as unified diff
func FormatUnifiedDiff(diff *FileDiff) string {
	if diff.Binary {
		return fmt.Sprintf("Binary files %s and %s differ\n", diff.OldPath, diff.NewPath)
	}

	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("--- %s\n", diff.OldPath))
	sb.WriteString(fmt.Sprintf("+++ %s\n", diff.NewPath))

	for _, hunk := range diff.Hunks {
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			hunk.OldStart, hunk.OldCount, hunk.NewStart, hunk.NewCount))

		for _, line := range hunk.Lines {
			switch line.Type {
			case Context:
				sb.WriteString(" ")
			case Add:
				sb.WriteString("+")
			case Remove:
				sb.WriteString("-")
			}
			sb.WriteString(line.Content)
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

// DiffStrings diffs two strings and returns unified diff
func DiffStrings(oldContent, newContent, oldPath, newPath string) string {
	// Check for binary content
	if isBinary(oldContent) || isBinary(newContent) {
		return fmt.Sprintf("Binary files %s and %s differ\n", oldPath, newPath)
	}

	oldLines := splitLines(oldContent)
	newLines := splitLines(newContent)

	diffLines := Myers(oldLines, newLines)
	if len(diffLines) == 0 {
		return ""
	}

	hunks := GenerateHunks(diffLines, 3)
	if len(hunks) == 0 {
		return ""
	}

	// Check if there are any actual changes
	hasChanges := false
	for _, hunk := range hunks {
		for _, line := range hunk.Lines {
			if line.Type != Context {
				hasChanges = true
				break
			}
		}
		if hasChanges {
			break
		}
	}

	if !hasChanges {
		return ""
	}

	diff := &FileDiff{
		OldPath: oldPath,
		NewPath: newPath,
		Hunks:   hunks,
	}

	return FormatUnifiedDiff(diff)
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	// Remove empty last element if string ends with newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func isBinary(s string) bool {
	for _, c := range s {
		if c == 0 {
			return true
		}
	}
	return false
}

// DiffStat returns statistics for a diff
type DiffStat struct {
	Path       string
	Insertions int
	Deletions  int
}

// GetDiffStats returns stats from diff lines
func GetDiffStats(path string, lines []DiffLine) DiffStat {
	stat := DiffStat{Path: path}
	for _, line := range lines {
		switch line.Type {
		case Add:
			stat.Insertions++
		case Remove:
			stat.Deletions++
		}
	}
	return stat
}

// FormatDiffStat formats diff stats
func FormatDiffStat(stats []DiffStat) string {
	var sb strings.Builder
	totalAdd := 0
	totalDel := 0
	maxPathLen := 0

	for _, stat := range stats {
		if len(stat.Path) > maxPathLen {
			maxPathLen = len(stat.Path)
		}
		totalAdd += stat.Insertions
		totalDel += stat.Deletions
	}

	for _, stat := range stats {
		total := stat.Insertions + stat.Deletions
		bar := ""
		for i := 0; i < min(total, 40); i++ {
			if i < stat.Insertions*40/(total) {
				bar += "+"
			} else {
				bar += "-"
			}
		}
		sb.WriteString(fmt.Sprintf(" %-*s | %3d %s\n", maxPathLen, stat.Path, total, bar))
	}

	sb.WriteString(fmt.Sprintf(" %d file(s) changed, %d insertions(+), %d deletions(-)\n",
		len(stats), totalAdd, totalDel))

	return sb.String()
}
