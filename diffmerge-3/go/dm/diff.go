package dm

import (
	"strings"
)

// DiffLines computes a line-by-line diff using LCS algorithm
func DiffLines(old, new string, options DiffOptions) DiffResult {
	oldLines := SplitLines(old)
	newLines := SplitLines(new)

	// Handle ignore_blank_lines option
	if options.IgnoreBlankLines {
		oldLines = filterBlankLines(oldLines)
		newLines = filterBlankLines(newLines)
	}

	// Compute LCS
	lcs := computeLCS(oldLines, newLines, options.IgnoreWhitespace)

	// Generate hunks from LCS
	hunks := generateHunks(oldLines, newLines, lcs, options)

	// Calculate stats
	stats := calculateStats(hunks)

	return DiffResult{
		Hunks: hunks,
		Stats: stats,
	}
}

// filterBlankLines removes blank lines from the slice
func filterBlankLines(lines []string) []string {
	result := []string{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(strings.TrimRight(line, "\r\n"))
		if trimmed != "" {
			result = append(result, line)
		}
	}
	return result
}

// computeLCS computes the longest common subsequence indices
func computeLCS(oldLines, newLines []string, ignoreWhitespace bool) [][2]int {
	m := len(oldLines)
	n := len(newLines)

	if m == 0 || n == 0 {
		return [][2]int{}
	}

	// Create comparison function
	equals := func(a, b string) bool {
		if ignoreWhitespace {
			return trimLine(a) == trimLine(b)
		}
		return a == b
	}

	// Build LCS length matrix
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if equals(oldLines[i-1], newLines[j-1]) {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}

	// Backtrack to find LCS pairs
	lcs := [][2]int{}
	i, j := m, n
	for i > 0 && j > 0 {
		if equals(oldLines[i-1], newLines[j-1]) {
			lcs = append([][2]int{{i - 1, j - 1}}, lcs...)
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

// generateHunks generates diff hunks from LCS
func generateHunks(oldLines, newLines []string, lcs [][2]int, options DiffOptions) []DiffHunk {
	hunks := []DiffHunk{}

	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for lcsIdx < len(lcs) || oldIdx < len(oldLines) || newIdx < len(newLines) {
		if lcsIdx < len(lcs) {
			matchOld := lcs[lcsIdx][0]
			matchNew := lcs[lcsIdx][1]

			// Add deletions before this match
			for oldIdx < matchOld {
				hunks = append(hunks, DiffHunk{
					Op:       DiffOpDelete,
					Content:  oldLines[oldIdx],
					OldStart: oldIdx + 1,
					OldCount: 1,
				})
				oldIdx++
			}

			// Add insertions before this match
			for newIdx < matchNew {
				hunks = append(hunks, DiffHunk{
					Op:       DiffOpInsert,
					Content:  newLines[newIdx],
					NewStart: newIdx + 1,
					NewCount: 1,
				})
				newIdx++
			}

			// Add the matching line as equal
			hunks = append(hunks, DiffHunk{
				Op:       DiffOpEqual,
				Content:  newLines[newIdx],
				OldStart: oldIdx + 1,
				NewStart: newIdx + 1,
				OldCount: 1,
				NewCount: 1,
			})
			oldIdx++
			newIdx++
			lcsIdx++
		} else {
			// No more matches, add remaining deletions
			for oldIdx < len(oldLines) {
				hunks = append(hunks, DiffHunk{
					Op:       DiffOpDelete,
					Content:  oldLines[oldIdx],
					OldStart: oldIdx + 1,
					OldCount: 1,
				})
				oldIdx++
			}

			// Add remaining insertions
			for newIdx < len(newLines) {
				hunks = append(hunks, DiffHunk{
					Op:       DiffOpInsert,
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

// calculateStats calculates diff statistics from hunks
func calculateStats(hunks []DiffHunk) DiffStats {
	additions := 0
	deletions := 0

	for _, hunk := range hunks {
		switch hunk.Op {
		case DiffOpInsert:
			additions++
		case DiffOpDelete:
			deletions++
		}
	}

	return DiffStats{
		Additions: additions,
		Deletions: deletions,
		Changes:   min(additions, deletions),
	}
}

// DiffWords computes word-by-word diff within a single line
func DiffWords(old, new string) []DiffHunk {
	oldWords := tokenizeWords(old)
	newWords := tokenizeWords(new)

	if len(oldWords) == 0 && len(newWords) == 0 {
		return []DiffHunk{}
	}

	lcs := computeWordLCS(oldWords, newWords)
	return generateWordHunks(oldWords, newWords, lcs)
}

// tokenizeWords splits a string into words and whitespace tokens
func tokenizeWords(s string) []string {
	tokens := []string{}
	current := ""
	inWord := false

	for _, r := range s {
		isWordChar := !isWhitespaceOrPunct(r)
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

// isWhitespaceOrPunct checks if a rune is whitespace or punctuation
func isWhitespaceOrPunct(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' ||
		r == ',' || r == '.' || r == '!' || r == '?' ||
		r == ';' || r == ':' || r == '"' || r == '\''
}

// computeWordLCS computes LCS for word tokens
func computeWordLCS(oldWords, newWords []string) [][2]int {
	m := len(oldWords)
	n := len(newWords)

	if m == 0 || n == 0 {
		return [][2]int{}
	}

	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if oldWords[i-1] == newWords[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}

	lcs := [][2]int{}
	i, j := m, n
	for i > 0 && j > 0 {
		if oldWords[i-1] == newWords[j-1] {
			lcs = append([][2]int{{i - 1, j - 1}}, lcs...)
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

// generateWordHunks generates hunks from word LCS
func generateWordHunks(oldWords, newWords []string, lcs [][2]int) []DiffHunk {
	hunks := []DiffHunk{}

	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for lcsIdx < len(lcs) || oldIdx < len(oldWords) || newIdx < len(newWords) {
		if lcsIdx < len(lcs) {
			matchOld := lcs[lcsIdx][0]
			matchNew := lcs[lcsIdx][1]

			// Collect deletions
			deleted := ""
			for oldIdx < matchOld {
				deleted += oldWords[oldIdx]
				oldIdx++
			}
			if deleted != "" {
				hunks = append(hunks, DiffHunk{Op: DiffOpDelete, Content: deleted})
			}

			// Collect insertions
			inserted := ""
			for newIdx < matchNew {
				inserted += newWords[newIdx]
				newIdx++
			}
			if inserted != "" {
				hunks = append(hunks, DiffHunk{Op: DiffOpInsert, Content: inserted})
			}

			// Add equal
			hunks = append(hunks, DiffHunk{Op: DiffOpEqual, Content: newWords[newIdx]})
			oldIdx++
			newIdx++
			lcsIdx++
		} else {
			// Remaining deletions
			deleted := ""
			for oldIdx < len(oldWords) {
				deleted += oldWords[oldIdx]
				oldIdx++
			}
			if deleted != "" {
				hunks = append(hunks, DiffHunk{Op: DiffOpDelete, Content: deleted})
			}

			// Remaining insertions
			inserted := ""
			for newIdx < len(newWords) {
				inserted += newWords[newIdx]
				newIdx++
			}
			if inserted != "" {
				hunks = append(hunks, DiffHunk{Op: DiffOpInsert, Content: inserted})
			}
		}
	}

	return hunks
}

// DiffChars computes character-by-character diff
func DiffChars(old, new string) []DiffHunk {
	oldRunes := []rune(old)
	newRunes := []rune(new)

	if len(oldRunes) == 0 && len(newRunes) == 0 {
		return []DiffHunk{}
	}

	lcs := computeCharLCS(oldRunes, newRunes)
	return generateCharHunks(oldRunes, newRunes, lcs)
}

// computeCharLCS computes LCS for characters
func computeCharLCS(oldRunes, newRunes []rune) [][2]int {
	m := len(oldRunes)
	n := len(newRunes)

	if m == 0 || n == 0 {
		return [][2]int{}
	}

	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if oldRunes[i-1] == newRunes[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}

	lcs := [][2]int{}
	i, j := m, n
	for i > 0 && j > 0 {
		if oldRunes[i-1] == newRunes[j-1] {
			lcs = append([][2]int{{i - 1, j - 1}}, lcs...)
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

// generateCharHunks generates hunks from character LCS
func generateCharHunks(oldRunes, newRunes []rune, lcs [][2]int) []DiffHunk {
	hunks := []DiffHunk{}

	oldIdx := 0
	newIdx := 0
	lcsIdx := 0

	for lcsIdx < len(lcs) || oldIdx < len(oldRunes) || newIdx < len(newRunes) {
		if lcsIdx < len(lcs) {
			matchOld := lcs[lcsIdx][0]
			matchNew := lcs[lcsIdx][1]

			// Collect deletions
			if oldIdx < matchOld {
				deleted := string(oldRunes[oldIdx:matchOld])
				hunks = append(hunks, DiffHunk{Op: DiffOpDelete, Content: deleted})
				oldIdx = matchOld
			}

			// Collect insertions
			if newIdx < matchNew {
				inserted := string(newRunes[newIdx:matchNew])
				hunks = append(hunks, DiffHunk{Op: DiffOpInsert, Content: inserted})
				newIdx = matchNew
			}

			// Collect equal sequence
			equalStart := lcsIdx
			for lcsIdx < len(lcs) &&
				lcs[lcsIdx][0] == matchOld+(lcsIdx-equalStart) &&
				lcs[lcsIdx][1] == matchNew+(lcsIdx-equalStart) {
				lcsIdx++
			}
			equalContent := string(newRunes[newIdx : newIdx+(lcsIdx-equalStart)])
			hunks = append(hunks, DiffHunk{Op: DiffOpEqual, Content: equalContent})
			oldIdx += lcsIdx - equalStart
			newIdx += lcsIdx - equalStart
		} else {
			// Remaining deletions
			if oldIdx < len(oldRunes) {
				deleted := string(oldRunes[oldIdx:])
				hunks = append(hunks, DiffHunk{Op: DiffOpDelete, Content: deleted})
				oldIdx = len(oldRunes)
			}

			// Remaining insertions
			if newIdx < len(newRunes) {
				inserted := string(newRunes[newIdx:])
				hunks = append(hunks, DiffHunk{Op: DiffOpInsert, Content: inserted})
				newIdx = len(newRunes)
			}
		}
	}

	return hunks
}
