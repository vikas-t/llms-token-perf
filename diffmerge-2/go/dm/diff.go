package dm

import (
	"strings"
	"unicode"
)

// lcs computes the Longest Common Subsequence of two slices
func lcs(a, b []string) []string {
	m := len(a)
	n := len(b)

	// Create DP table
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	// Fill DP table
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
	result := make([]string, 0, dp[m][n])
	i, j := m, n
	for i > 0 && j > 0 {
		if a[i-1] == b[j-1] {
			result = append([]string{a[i-1]}, result...)
			i--
			j--
		} else if dp[i-1][j] > dp[i][j-1] {
			i--
		} else {
			j--
		}
	}

	return result
}

// DiffLines computes a line-by-line diff
func DiffLines(old, new string, options DiffOptions) DiffResult {
	// Handle context lines default
	if options.ContextLines == 0 {
		options.ContextLines = 3
	}

	oldLines := SplitLines(old)
	newLines := SplitLines(new)

	// Create comparison versions for ignore options
	oldCompare := make([]string, len(oldLines))
	newCompare := make([]string, len(newLines))

	for i, line := range oldLines {
		if options.IgnoreWhitespace {
			oldCompare[i] = strings.TrimSpace(line)
		} else {
			oldCompare[i] = line
		}
	}

	for i, line := range newLines {
		if options.IgnoreWhitespace {
			newCompare[i] = strings.TrimSpace(line)
		} else {
			newCompare[i] = line
		}
	}

	// Filter blank lines if needed
	var oldFiltered, newFiltered []int
	var oldCompareFiltered, newCompareFiltered []string

	if options.IgnoreBlankLines {
		for i, line := range oldCompare {
			if strings.TrimSpace(line) != "" {
				oldFiltered = append(oldFiltered, i)
				oldCompareFiltered = append(oldCompareFiltered, line)
			}
		}
		for i, line := range newCompare {
			if strings.TrimSpace(line) != "" {
				newFiltered = append(newFiltered, i)
				newCompareFiltered = append(newCompareFiltered, line)
			}
		}
	} else {
		for i := range oldCompare {
			oldFiltered = append(oldFiltered, i)
		}
		oldCompareFiltered = oldCompare
		for i := range newCompare {
			newFiltered = append(newFiltered, i)
		}
		newCompareFiltered = newCompare
	}

	// Compute LCS on the filtered/compared versions
	common := lcs(oldCompareFiltered, newCompareFiltered)

	// Build hunks by tracking positions
	var hunks []DiffHunk
	additions := 0
	deletions := 0

	oldIdx := 0
	newIdx := 0
	commonIdx := 0

	for oldIdx < len(oldFiltered) || newIdx < len(newFiltered) {
		if commonIdx < len(common) {
			// Find next common line in old
			oldNext := -1
			for i := oldIdx; i < len(oldFiltered); i++ {
				if oldCompareFiltered[i] == common[commonIdx] {
					oldNext = i
					break
				}
			}

			// Find next common line in new
			newNext := -1
			for i := newIdx; i < len(newFiltered); i++ {
				if newCompareFiltered[i] == common[commonIdx] {
					newNext = i
					break
				}
			}

			// Add deletions before the common line
			for oldIdx < oldNext {
				realIdx := oldFiltered[oldIdx]
				hunks = append(hunks, DiffHunk{
					Op:       OpDelete,
					Content:  oldLines[realIdx],
					OldStart: realIdx + 1,
					OldCount: 1,
				})
				deletions++
				oldIdx++
			}

			// Add insertions before the common line
			for newIdx < newNext {
				realIdx := newFiltered[newIdx]
				hunks = append(hunks, DiffHunk{
					Op:       OpInsert,
					Content:  newLines[realIdx],
					NewStart: realIdx + 1,
					NewCount: 1,
				})
				additions++
				newIdx++
			}

			// Add the equal line
			oldRealIdx := oldFiltered[oldIdx]
			newRealIdx := newFiltered[newIdx]
			hunks = append(hunks, DiffHunk{
				Op:       OpEqual,
				Content:  oldLines[oldRealIdx],
				OldStart: oldRealIdx + 1,
				NewStart: newRealIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			oldIdx++
			newIdx++
			commonIdx++
		} else {
			// No more common lines - rest are deletions/insertions
			for oldIdx < len(oldFiltered) {
				realIdx := oldFiltered[oldIdx]
				hunks = append(hunks, DiffHunk{
					Op:       OpDelete,
					Content:  oldLines[realIdx],
					OldStart: realIdx + 1,
					OldCount: 1,
				})
				deletions++
				oldIdx++
			}
			for newIdx < len(newFiltered) {
				realIdx := newFiltered[newIdx]
				hunks = append(hunks, DiffHunk{
					Op:       OpInsert,
					Content:  newLines[realIdx],
					NewStart: realIdx + 1,
					NewCount: 1,
				})
				additions++
				newIdx++
			}
		}
	}

	// Filter hunks based on context if needed
	if options.ContextLines > 0 && len(hunks) > 0 {
		hunks = filterHunksByContext(hunks, options.ContextLines)
	}

	return DiffResult{
		Hunks: hunks,
		Stats: DiffStats{
			Additions: additions,
			Deletions: deletions,
			Changes:   min(additions, deletions),
		},
	}
}

// filterHunksByContext keeps only hunks within context of changes
func filterHunksByContext(hunks []DiffHunk, contextLines int) []DiffHunk {
	if len(hunks) == 0 {
		return hunks
	}

	// Find indices of change hunks
	var changeIndices []int
	for i, h := range hunks {
		if h.Op != OpEqual {
			changeIndices = append(changeIndices, i)
		}
	}

	if len(changeIndices) == 0 {
		return hunks
	}

	// Mark which hunks to keep
	keep := make([]bool, len(hunks))
	for _, ci := range changeIndices {
		keep[ci] = true
		// Keep context before
		for i := ci - 1; i >= 0 && i >= ci-contextLines; i-- {
			keep[i] = true
		}
		// Keep context after
		for i := ci + 1; i < len(hunks) && i <= ci+contextLines; i++ {
			keep[i] = true
		}
	}

	var result []DiffHunk
	for i, h := range hunks {
		if keep[i] {
			result = append(result, h)
		}
	}

	return result
}

// tokenizeWords splits text into word tokens
func tokenizeWords(text string) []string {
	var tokens []string
	var current strings.Builder

	for _, r := range text {
		if unicode.IsSpace(r) {
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			tokens = append(tokens, string(r))
		} else if unicode.IsPunct(r) {
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			tokens = append(tokens, string(r))
		} else {
			current.WriteRune(r)
		}
	}

	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}

	return tokens
}

// DiffWords computes a word-by-word diff
func DiffWords(old, new string) []DiffHunk {
	oldTokens := tokenizeWords(old)
	newTokens := tokenizeWords(new)

	return diffTokens(oldTokens, newTokens)
}

// DiffChars computes a character-by-character diff
func DiffChars(old, new string) []DiffHunk {
	oldChars := []rune(old)
	newChars := []rune(new)

	oldStrs := make([]string, len(oldChars))
	newStrs := make([]string, len(newChars))

	for i, r := range oldChars {
		oldStrs[i] = string(r)
	}
	for i, r := range newChars {
		newStrs[i] = string(r)
	}

	return diffTokens(oldStrs, newStrs)
}

// diffTokens computes a diff between token sequences
func diffTokens(oldTokens, newTokens []string) []DiffHunk {
	common := lcs(oldTokens, newTokens)

	var hunks []DiffHunk

	oldIdx := 0
	newIdx := 0
	commonIdx := 0

	for oldIdx < len(oldTokens) || newIdx < len(newTokens) {
		if commonIdx < len(common) {
			// Find next common token in old
			oldNext := -1
			for i := oldIdx; i < len(oldTokens); i++ {
				if oldTokens[i] == common[commonIdx] {
					oldNext = i
					break
				}
			}

			// Find next common token in new
			newNext := -1
			for i := newIdx; i < len(newTokens); i++ {
				if newTokens[i] == common[commonIdx] {
					newNext = i
					break
				}
			}

			// Add deletions before
			if oldNext > oldIdx {
				content := strings.Join(oldTokens[oldIdx:oldNext], "")
				hunks = append(hunks, DiffHunk{
					Op:      OpDelete,
					Content: content,
				})
			}

			// Add insertions before
			if newNext > newIdx {
				content := strings.Join(newTokens[newIdx:newNext], "")
				hunks = append(hunks, DiffHunk{
					Op:      OpInsert,
					Content: content,
				})
			}

			// Add equal token(s) - merge consecutive equals
			equalStart := commonIdx
			equalOldStart := oldNext
			equalNewStart := newNext

			for commonIdx < len(common) {
				nextOld := -1
				for i := equalOldStart + (commonIdx - equalStart); i < len(oldTokens); i++ {
					if oldTokens[i] == common[commonIdx] {
						nextOld = i
						break
					}
				}

				nextNew := -1
				for i := equalNewStart + (commonIdx - equalStart); i < len(newTokens); i++ {
					if newTokens[i] == common[commonIdx] {
						nextNew = i
						break
					}
				}

				if nextOld == equalOldStart+(commonIdx-equalStart) && nextNew == equalNewStart+(commonIdx-equalStart) {
					commonIdx++
				} else {
					break
				}
			}

			content := strings.Join(common[equalStart:commonIdx], "")
			hunks = append(hunks, DiffHunk{
				Op:      OpEqual,
				Content: content,
			})

			oldIdx = oldNext + (commonIdx - equalStart)
			newIdx = newNext + (commonIdx - equalStart)
		} else {
			// No more common tokens
			if oldIdx < len(oldTokens) {
				content := strings.Join(oldTokens[oldIdx:], "")
				hunks = append(hunks, DiffHunk{
					Op:      OpDelete,
					Content: content,
				})
				oldIdx = len(oldTokens)
			}
			if newIdx < len(newTokens) {
				content := strings.Join(newTokens[newIdx:], "")
				hunks = append(hunks, DiffHunk{
					Op:      OpInsert,
					Content: content,
				})
				newIdx = len(newTokens)
			}
		}
	}

	// Merge consecutive hunks of same type
	if len(hunks) > 0 {
		var merged []DiffHunk
		current := hunks[0]

		for i := 1; i < len(hunks); i++ {
			if hunks[i].Op == current.Op {
				current.Content += hunks[i].Content
			} else {
				merged = append(merged, current)
				current = hunks[i]
			}
		}
		merged = append(merged, current)
		hunks = merged
	}

	return hunks
}
