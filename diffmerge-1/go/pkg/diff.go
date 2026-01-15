package pkg

import (
	"strings"
)

// DiffLines computes line-by-line diff using LCS algorithm
func DiffLines(old, new string, options DiffOptions) DiffResult {
	oldLines := splitIntoLines(old)
	newLines := splitIntoLines(new)

	// Create comparison versions of lines based on options
	oldCompare := make([]string, len(oldLines))
	newCompare := make([]string, len(newLines))

	for i, line := range oldLines {
		oldCompare[i] = normalizeLine(line, options)
	}
	for i, line := range newLines {
		newCompare[i] = normalizeLine(line, options)
	}

	// If ignoring blank lines, filter them out for comparison
	if options.IgnoreBlankLines {
		oldFiltered, oldIndices := filterBlankLines(oldLines, oldCompare)
		newFiltered, newIndices := filterBlankLines(newLines, newCompare)

		hunks := computeLineDiff(oldFiltered, newFiltered, oldIndices, newIndices, oldLines, newLines, options)
		return buildDiffResult(hunks, oldLines, newLines, options)
	}

	hunks := computeLineDiffSimple(oldLines, newLines, oldCompare, newCompare, options)
	return buildDiffResult(hunks, oldLines, newLines, options)
}

// splitIntoLines splits content into lines for diff
func splitIntoLines(content string) []string {
	if content == "" {
		return []string{}
	}

	lines := strings.Split(content, "\n")

	// If the content ends with a newline, remove the empty last element
	// but keep track that it ended with newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	return lines
}

// normalizeLine normalizes a line based on options
func normalizeLine(line string, options DiffOptions) string {
	if options.IgnoreWhitespace {
		return strings.TrimSpace(line)
	}
	return line
}

// filterBlankLines filters out blank lines and returns indices mapping
func filterBlankLines(lines, compare []string) ([]string, []int) {
	filtered := []string{}
	indices := []int{}
	for i, c := range compare {
		if strings.TrimSpace(c) != "" {
			filtered = append(filtered, compare[i])
			indices = append(indices, i)
		}
	}
	return filtered, indices
}

// computeLineDiffSimple computes diff without blank line filtering
func computeLineDiffSimple(oldLines, newLines, oldCompare, newCompare []string, options DiffOptions) []DiffHunk {
	// Compute LCS
	lcs := computeLCS(oldCompare, newCompare)

	hunks := []DiffHunk{}
	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for oldIdx < len(oldLines) || newIdx < len(newLines) {
		// Check if current lines match LCS
		if lcsIdx < len(lcs) && oldIdx < len(oldLines) && newIdx < len(newLines) &&
			oldCompare[oldIdx] == lcs[lcsIdx] && newCompare[newIdx] == lcs[lcsIdx] {
			// Equal
			hunks = append(hunks, DiffHunk{
				Op:       OpEqual,
				Content:  oldLines[oldIdx],
				OldStart: oldIdx + 1,
				NewStart: newIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			oldIdx++
			newIdx++
			lcsIdx++
		} else {
			// Deletion from old
			if oldIdx < len(oldLines) && (lcsIdx >= len(lcs) || oldCompare[oldIdx] != lcs[lcsIdx]) {
				hunks = append(hunks, DiffHunk{
					Op:       OpDelete,
					Content:  oldLines[oldIdx],
					OldStart: oldIdx + 1,
					OldCount: 1,
				})
				oldIdx++
			} else if newIdx < len(newLines) && (lcsIdx >= len(lcs) || newCompare[newIdx] != lcs[lcsIdx]) {
				// Insertion in new
				hunks = append(hunks, DiffHunk{
					Op:       OpInsert,
					Content:  newLines[newIdx],
					NewStart: newIdx + 1,
					NewCount: 1,
				})
				newIdx++
			}
		}
	}

	return hunks
}

// computeLineDiff computes diff with blank line filtering
func computeLineDiff(oldFiltered, newFiltered []string, oldIndices, newIndices []int, oldLines, newLines []string, options DiffOptions) []DiffHunk {
	// Compute LCS on filtered lines
	lcs := computeLCS(oldFiltered, newFiltered)

	hunks := []DiffHunk{}
	oldIdx := 0
	newIdx := 0
	filteredOldIdx := 0
	filteredNewIdx := 0
	lcsIdx := 0

	for oldIdx < len(oldLines) || newIdx < len(newLines) {
		// Skip blank lines in old
		if oldIdx < len(oldLines) && (filteredOldIdx >= len(oldIndices) || oldIndices[filteredOldIdx] != oldIdx) {
			hunks = append(hunks, DiffHunk{
				Op:       OpEqual,
				Content:  oldLines[oldIdx],
				OldStart: oldIdx + 1,
				NewStart: newIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			oldIdx++
			continue
		}

		// Skip blank lines in new
		if newIdx < len(newLines) && (filteredNewIdx >= len(newIndices) || newIndices[filteredNewIdx] != newIdx) {
			hunks = append(hunks, DiffHunk{
				Op:       OpEqual,
				Content:  newLines[newIdx],
				OldStart: oldIdx + 1,
				NewStart: newIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			newIdx++
			continue
		}

		// Check if current filtered lines match LCS
		if lcsIdx < len(lcs) && filteredOldIdx < len(oldFiltered) && filteredNewIdx < len(newFiltered) &&
			oldFiltered[filteredOldIdx] == lcs[lcsIdx] && newFiltered[filteredNewIdx] == lcs[lcsIdx] {
			// Equal
			hunks = append(hunks, DiffHunk{
				Op:       OpEqual,
				Content:  oldLines[oldIdx],
				OldStart: oldIdx + 1,
				NewStart: newIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			oldIdx++
			newIdx++
			filteredOldIdx++
			filteredNewIdx++
			lcsIdx++
		} else {
			// Deletion from old
			if filteredOldIdx < len(oldFiltered) && (lcsIdx >= len(lcs) || oldFiltered[filteredOldIdx] != lcs[lcsIdx]) {
				hunks = append(hunks, DiffHunk{
					Op:       OpDelete,
					Content:  oldLines[oldIdx],
					OldStart: oldIdx + 1,
					OldCount: 1,
				})
				oldIdx++
				filteredOldIdx++
			} else if filteredNewIdx < len(newFiltered) && (lcsIdx >= len(lcs) || newFiltered[filteredNewIdx] != lcs[lcsIdx]) {
				// Insertion in new
				hunks = append(hunks, DiffHunk{
					Op:       OpInsert,
					Content:  newLines[newIdx],
					NewStart: newIdx + 1,
					NewCount: 1,
				})
				newIdx++
				filteredNewIdx++
			}
		}
	}

	return hunks
}

// computeLCS computes the Longest Common Subsequence
func computeLCS(a, b []string) []string {
	m := len(a)
	n := len(b)

	if m == 0 || n == 0 {
		return []string{}
	}

	// Build DP table
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}

	// Backtrack to find LCS
	lcs := make([]string, 0, dp[m][n])
	i, j := m, n
	for i > 0 && j > 0 {
		if a[i-1] == b[j-1] {
			lcs = append([]string{a[i-1]}, lcs...)
			i--
			j--
		} else if dp[i-1][j] > dp[i][j-1] {
			i--
		} else {
			j--
		}
	}

	return lcs
}

// buildDiffResult builds the final diff result with stats
func buildDiffResult(hunks []DiffHunk, oldLines, newLines []string, options DiffOptions) DiffResult {
	// Filter hunks based on context if needed
	filteredHunks := filterHunksByContext(hunks, options.ContextLines)

	stats := DiffStats{}
	for _, h := range hunks {
		switch h.Op {
		case OpInsert:
			stats.Additions++
		case OpDelete:
			stats.Deletions++
		}
	}

	return DiffResult{
		Hunks: filteredHunks,
		Stats: stats,
	}
}

// filterHunksByContext filters hunks to only include those within context of changes
func filterHunksByContext(hunks []DiffHunk, contextLines int) []DiffHunk {
	if len(hunks) == 0 {
		return hunks
	}

	// Default context lines to 3 if not specified
	if contextLines <= 0 {
		contextLines = 3
	}

	// Find positions of changes
	changePositions := []int{}
	for i, h := range hunks {
		if h.Op != OpEqual {
			changePositions = append(changePositions, i)
		}
	}

	if len(changePositions) == 0 {
		return hunks
	}

	// Mark hunks to include
	include := make([]bool, len(hunks))
	for _, pos := range changePositions {
		// Include the change itself
		include[pos] = true
		// Include context before
		for i := max(0, pos-contextLines); i < pos; i++ {
			include[i] = true
		}
		// Include context after
		for i := pos + 1; i <= min(len(hunks)-1, pos+contextLines); i++ {
			include[i] = true
		}
	}

	// Build filtered list
	result := []DiffHunk{}
	for i, h := range hunks {
		if include[i] {
			result = append(result, h)
		}
	}

	return result
}

// DiffWords computes word-by-word diff
func DiffWords(old, new string) []DiffHunk {
	oldWords := tokenizeWords(old)
	newWords := tokenizeWords(new)

	lcs := computeLCS(oldWords, newWords)

	hunks := []DiffHunk{}
	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for oldIdx < len(oldWords) || newIdx < len(newWords) {
		if lcsIdx < len(lcs) && oldIdx < len(oldWords) && newIdx < len(newWords) &&
			oldWords[oldIdx] == lcs[lcsIdx] && newWords[newIdx] == lcs[lcsIdx] {
			// Equal
			hunks = append(hunks, DiffHunk{
				Op:      OpEqual,
				Content: oldWords[oldIdx],
			})
			oldIdx++
			newIdx++
			lcsIdx++
		} else {
			// Deletion
			if oldIdx < len(oldWords) && (lcsIdx >= len(lcs) || oldWords[oldIdx] != lcs[lcsIdx]) {
				hunks = append(hunks, DiffHunk{
					Op:      OpDelete,
					Content: oldWords[oldIdx],
				})
				oldIdx++
			} else if newIdx < len(newWords) && (lcsIdx >= len(lcs) || newWords[newIdx] != lcs[lcsIdx]) {
				// Insertion
				hunks = append(hunks, DiffHunk{
					Op:      OpInsert,
					Content: newWords[newIdx],
				})
				newIdx++
			}
		}
	}

	return mergeAdjacentHunks(hunks)
}

// tokenizeWords splits text into words and whitespace
func tokenizeWords(text string) []string {
	tokens := []string{}
	current := ""
	inWord := false

	for _, r := range text {
		isWordChar := !isWhitespace(r) && !isPunctuation(r)

		if isWordChar {
			if !inWord && current != "" {
				tokens = append(tokens, current)
				current = ""
			}
			inWord = true
			current += string(r)
		} else {
			if inWord && current != "" {
				tokens = append(tokens, current)
				current = ""
			}
			inWord = false
			current += string(r)
		}
	}

	if current != "" {
		tokens = append(tokens, current)
	}

	return tokens
}

func isWhitespace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r'
}

func isPunctuation(r rune) bool {
	return r == ',' || r == '.' || r == '!' || r == '?' || r == ';' || r == ':' ||
		r == '\'' || r == '"' || r == '(' || r == ')' || r == '[' || r == ']' ||
		r == '{' || r == '}' || r == '-' || r == '/'
}

// DiffChars computes character-by-character diff
func DiffChars(old, new string) []DiffHunk {
	oldChars := []string{}
	newChars := []string{}

	for _, r := range old {
		oldChars = append(oldChars, string(r))
	}
	for _, r := range new {
		newChars = append(newChars, string(r))
	}

	lcs := computeLCS(oldChars, newChars)

	hunks := []DiffHunk{}
	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for oldIdx < len(oldChars) || newIdx < len(newChars) {
		if lcsIdx < len(lcs) && oldIdx < len(oldChars) && newIdx < len(newChars) &&
			oldChars[oldIdx] == lcs[lcsIdx] && newChars[newIdx] == lcs[lcsIdx] {
			// Equal
			hunks = append(hunks, DiffHunk{
				Op:      OpEqual,
				Content: oldChars[oldIdx],
			})
			oldIdx++
			newIdx++
			lcsIdx++
		} else {
			// Deletion
			if oldIdx < len(oldChars) && (lcsIdx >= len(lcs) || oldChars[oldIdx] != lcs[lcsIdx]) {
				hunks = append(hunks, DiffHunk{
					Op:      OpDelete,
					Content: oldChars[oldIdx],
				})
				oldIdx++
			} else if newIdx < len(newChars) && (lcsIdx >= len(lcs) || newChars[newIdx] != lcs[lcsIdx]) {
				// Insertion
				hunks = append(hunks, DiffHunk{
					Op:      OpInsert,
					Content: newChars[newIdx],
				})
				newIdx++
			}
		}
	}

	return mergeAdjacentHunks(hunks)
}

// mergeAdjacentHunks merges adjacent hunks with the same operation
func mergeAdjacentHunks(hunks []DiffHunk) []DiffHunk {
	if len(hunks) == 0 {
		return hunks
	}

	result := []DiffHunk{hunks[0]}

	for i := 1; i < len(hunks); i++ {
		last := &result[len(result)-1]
		if last.Op == hunks[i].Op {
			last.Content += hunks[i].Content
		} else {
			result = append(result, hunks[i])
		}
	}

	return result
}
