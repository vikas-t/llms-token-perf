package dm

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// CreatePatch generates a unified diff format patch
func CreatePatch(old, new string, options PatchOptions) string {
	oldFile := options.OldFile
	newFile := options.NewFile
	contextLines := options.ContextLines

	if oldFile == "" {
		oldFile = "a"
	}
	if newFile == "" {
		newFile = "b"
	}
	if contextLines == 0 {
		contextLines = 3
	}

	oldLines := SplitLines(old)
	newLines := SplitLines(new)

	// Compute the diff
	diffResult := DiffLines(old, new, DiffOptions{})

	// If no changes, return minimal patch
	if diffResult.Stats.Additions == 0 && diffResult.Stats.Deletions == 0 {
		return fmt.Sprintf("--- %s\n+++ %s\n", oldFile, newFile)
	}

	// Build patch output
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- %s\n", oldFile))
	sb.WriteString(fmt.Sprintf("+++ %s\n", newFile))

	// Group hunks by regions of changes
	patchHunks := buildPatchHunks(oldLines, newLines, diffResult.Hunks, contextLines)

	for _, hunk := range patchHunks {
		sb.WriteString(hunk)
	}

	return sb.String()
}

// buildPatchHunks creates patch hunk strings from diff hunks
func buildPatchHunks(oldLines, newLines []string, hunks []DiffHunk, contextLines int) []string {
	if len(hunks) == 0 {
		return []string{}
	}

	// Find ranges of changes and group with context
	type changeRange struct {
		oldStart, oldEnd int
		newStart, newEnd int
	}

	// Collect change ranges
	ranges := []changeRange{}
	for _, h := range hunks {
		if h.Op == DiffOpDelete || h.Op == DiffOpInsert {
			oldIdx := 0
			newIdx := 0
			if h.Op == DiffOpDelete {
				oldIdx = h.OldStart - 1
			}
			if h.Op == DiffOpInsert {
				newIdx = h.NewStart - 1
			}

			if len(ranges) == 0 {
				ranges = append(ranges, changeRange{
					oldStart: oldIdx, oldEnd: oldIdx,
					newStart: newIdx, newEnd: newIdx,
				})
			} else {
				last := &ranges[len(ranges)-1]
				if h.Op == DiffOpDelete {
					if oldIdx <= last.oldEnd+contextLines*2+1 {
						last.oldEnd = oldIdx
					} else {
						ranges = append(ranges, changeRange{
							oldStart: oldIdx, oldEnd: oldIdx,
							newStart: newIdx, newEnd: newIdx,
						})
					}
				}
				if h.Op == DiffOpInsert {
					// Check proximity using the previous context
					if len(ranges) > 0 && newIdx <= ranges[len(ranges)-1].newEnd+contextLines*2+1 {
						ranges[len(ranges)-1].newEnd = newIdx
					} else if len(ranges) == 0 || ranges[len(ranges)-1].oldEnd != ranges[len(ranges)-1].oldStart ||
						ranges[len(ranges)-1].newEnd != ranges[len(ranges)-1].newStart {
						ranges = append(ranges, changeRange{
							oldStart: oldIdx, oldEnd: oldIdx,
							newStart: newIdx, newEnd: newIdx,
						})
					}
				}
			}
		}
	}

	// Simpler approach: iterate through hunks and build patch lines
	result := []string{}

	// Track old and new line positions
	oldPos := 0
	newPos := 0
	hunkIdx := 0

	for hunkIdx < len(hunks) {
		// Find the start of the next change region
		for hunkIdx < len(hunks) && hunks[hunkIdx].Op == DiffOpEqual {
			oldPos++
			newPos++
			hunkIdx++
		}

		if hunkIdx >= len(hunks) {
			break
		}

		// Found a change, collect it and surrounding context
		changeStartIdx := hunkIdx

		// Find where this change region ends
		changeEndIdx := hunkIdx
		for changeEndIdx < len(hunks) {
			if hunks[changeEndIdx].Op == DiffOpEqual {
				// Count consecutive equals
				equalCount := 0
				for i := changeEndIdx; i < len(hunks) && hunks[i].Op == DiffOpEqual; i++ {
					equalCount++
				}
				if equalCount > contextLines*2 {
					break
				}
			}
			changeEndIdx++
		}

		// Determine hunk bounds with context
		oldHunkStart := max(0, oldPos-contextLines)
		newHunkStart := max(0, newPos-contextLines)

		// Build the hunk content
		var hunkContent strings.Builder
		hunkOldLines := 0
		hunkNewLines := 0

		// Add leading context from original
		for i := oldHunkStart; i < oldPos && i < len(oldLines); i++ {
			line := stripNewline(oldLines[i])
			hunkContent.WriteString(" " + line + "\n")
			hunkOldLines++
			hunkNewLines++
		}

		// Process the change region
		tempOldPos := oldPos
		tempNewPos := newPos
		for i := changeStartIdx; i < changeEndIdx && i < len(hunks); i++ {
			h := hunks[i]
			switch h.Op {
			case DiffOpEqual:
				line := stripNewline(h.Content)
				hunkContent.WriteString(" " + line + "\n")
				hunkOldLines++
				hunkNewLines++
				tempOldPos++
				tempNewPos++
			case DiffOpDelete:
				line := stripNewline(h.Content)
				hunkContent.WriteString("-" + line + "\n")
				hunkOldLines++
				tempOldPos++
			case DiffOpInsert:
				line := stripNewline(h.Content)
				hunkContent.WriteString("+" + line + "\n")
				hunkNewLines++
				tempNewPos++
			}
		}

		// Add trailing context
		trailingStart := tempOldPos
		trailingEnd := min(tempOldPos+contextLines, len(oldLines))
		for i := trailingStart; i < trailingEnd; i++ {
			line := stripNewline(oldLines[i])
			hunkContent.WriteString(" " + line + "\n")
			hunkOldLines++
			hunkNewLines++
		}

		// Format hunk header
		hunkHeader := fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			oldHunkStart+1, hunkOldLines,
			newHunkStart+1, hunkNewLines)

		result = append(result, hunkHeader+hunkContent.String())

		// Move positions
		oldPos = tempOldPos
		newPos = tempNewPos
		hunkIdx = changeEndIdx

		// Skip trailing context in main loop
		for i := 0; i < contextLines && hunkIdx < len(hunks) && hunks[hunkIdx].Op == DiffOpEqual; i++ {
			oldPos++
			newPos++
			hunkIdx++
		}
	}

	return result
}

// stripNewline removes trailing newline from a line
func stripNewline(s string) string {
	return strings.TrimRight(s, "\r\n")
}

// ApplyPatch applies a unified diff patch to content
func ApplyPatch(content, patch string) ApplyResult {
	parsed, err := parsePatchInternal(patch)
	if err != nil {
		return ApplyResult{
			Content:      content,
			Success:      false,
			HunksApplied: 0,
			HunksFailed:  0,
			Errors:       []string{err.Error()},
		}
	}

	if len(parsed.Hunks) == 0 {
		return ApplyResult{
			Content:      content,
			Success:      true,
			HunksApplied: 0,
			HunksFailed:  0,
			Errors:       []string{},
		}
	}

	lines := SplitLines(content)
	result := make([]string, 0, len(lines))
	lineIdx := 0
	hunksApplied := 0
	hunksFailed := 0
	errors := []string{}

	for _, hunk := range parsed.Hunks {
		targetLine := hunk.OldStart - 1

		// Add lines before this hunk
		for lineIdx < targetLine && lineIdx < len(lines) {
			result = append(result, lines[lineIdx])
			lineIdx++
		}

		// Try to apply the hunk
		success, applied := applyHunk(lines, lineIdx, hunk)
		if success {
			result = append(result, applied...)
			// Skip over the old lines that were replaced
			for _, pl := range hunk.Lines {
				if pl.Op == " " || pl.Op == "-" {
					lineIdx++
				}
			}
			hunksApplied++
		} else {
			// Hunk failed, try fuzzy matching
			fuzzyLine, fuzzyApplied := fuzzyApplyHunk(lines, hunk)
			if fuzzyLine >= 0 {
				// Add any lines we skipped to reach the fuzzy match
				for lineIdx < fuzzyLine {
					result = append(result, lines[lineIdx])
					lineIdx++
				}
				result = append(result, fuzzyApplied...)
				for _, pl := range hunk.Lines {
					if pl.Op == " " || pl.Op == "-" {
						lineIdx++
					}
				}
				hunksApplied++
			} else {
				errors = append(errors, fmt.Sprintf("Hunk at line %d failed to apply", hunk.OldStart))
				hunksFailed++
			}
		}
	}

	// Add remaining lines
	for lineIdx < len(lines) {
		result = append(result, lines[lineIdx])
		lineIdx++
	}

	return ApplyResult{
		Content:      strings.Join(result, ""),
		Success:      hunksFailed == 0,
		HunksApplied: hunksApplied,
		HunksFailed:  hunksFailed,
		Errors:       errors,
	}
}

// applyHunk tries to apply a hunk at a specific position
func applyHunk(lines []string, startLine int, hunk PatchHunk) (bool, []string) {
	result := []string{}
	lineIdx := startLine

	for _, pl := range hunk.Lines {
		switch pl.Op {
		case " ":
			// Context line must match
			if lineIdx >= len(lines) {
				return false, nil
			}
			expectedContent := pl.Content
			actualContent := stripNewline(lines[lineIdx])
			if actualContent != expectedContent {
				return false, nil
			}
			result = append(result, lines[lineIdx])
			lineIdx++
		case "-":
			// Deletion must match
			if lineIdx >= len(lines) {
				return false, nil
			}
			expectedContent := pl.Content
			actualContent := stripNewline(lines[lineIdx])
			if actualContent != expectedContent {
				return false, nil
			}
			// Don't add to result (deleted)
			lineIdx++
		case "+":
			// Addition
			result = append(result, pl.Content+"\n")
		}
	}

	return true, result
}

// fuzzyApplyHunk tries to find the hunk content elsewhere in the file
func fuzzyApplyHunk(lines []string, hunk PatchHunk) (int, []string) {
	// Get the context lines from the hunk
	contextLines := []string{}
	for _, pl := range hunk.Lines {
		if pl.Op == " " || pl.Op == "-" {
			contextLines = append(contextLines, pl.Content)
		}
	}

	if len(contextLines) == 0 {
		return -1, nil
	}

	// Search for matching position
	for offset := 0; offset < len(lines); offset++ {
		// Try both directions from original position
		for _, dir := range []int{-1, 1} {
			searchLine := hunk.OldStart - 1 + (offset * dir)
			if searchLine < 0 || searchLine >= len(lines) {
				continue
			}

			// Check if context matches at this position
			matches := true
			tempLine := searchLine
			for _, ctx := range contextLines {
				if tempLine >= len(lines) || stripNewline(lines[tempLine]) != ctx {
					matches = false
					break
				}
				tempLine++
			}

			if matches {
				success, applied := applyHunk(lines, searchLine, hunk)
				if success {
					return searchLine, applied
				}
			}
		}
	}

	return -1, nil
}

// ReversePatch reverses a patch (swaps additions and deletions)
func ReversePatch(patch string) string {
	lines := strings.Split(patch, "\n")
	result := []string{}

	for _, line := range lines {
		if strings.HasPrefix(line, "---") {
			// Swap --- to +++
			result = append(result, "+++"+line[3:])
		} else if strings.HasPrefix(line, "+++") {
			// Swap +++ to ---
			result = append(result, "---"+line[3:])
		} else if strings.HasPrefix(line, "@@") {
			// Reverse the hunk header
			result = append(result, reverseHunkHeader(line))
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			// Change deletion to addition
			result = append(result, "+"+line[1:])
		} else if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			// Change addition to deletion
			result = append(result, "-"+line[1:])
		} else {
			result = append(result, line)
		}
	}

	return strings.Join(result, "\n")
}

// reverseHunkHeader reverses the line numbers in a hunk header
func reverseHunkHeader(header string) string {
	re := regexp.MustCompile(`@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@`)
	matches := re.FindStringSubmatch(header)
	if matches == nil {
		return header
	}

	oldStart := matches[1]
	oldCount := matches[2]
	if oldCount == "" {
		oldCount = "1"
	}
	newStart := matches[3]
	newCount := matches[4]
	if newCount == "" {
		newCount = "1"
	}

	return fmt.Sprintf("@@ -%s,%s +%s,%s @@", newStart, newCount, oldStart, oldCount)
}

// ParsePatch parses a unified diff format into structured data
func ParsePatch(patch string) (ParsedPatch, error) {
	return parsePatchInternal(patch)
}

// parsePatchInternal parses a unified diff
func parsePatchInternal(patch string) (ParsedPatch, error) {
	lines := strings.Split(patch, "\n")
	result := ParsedPatch{
		Hunks: []PatchHunk{},
	}

	i := 0

	// Skip empty lines at start
	for i < len(lines) && strings.TrimSpace(lines[i]) == "" {
		i++
	}

	// Parse file headers
	if i < len(lines) && strings.HasPrefix(lines[i], "---") {
		result.OldFile = strings.TrimSpace(lines[i][3:])
		i++
	}
	if i < len(lines) && strings.HasPrefix(lines[i], "+++") {
		result.NewFile = strings.TrimSpace(lines[i][3:])
		i++
	}

	// Check if we found valid headers or have any hunks
	hasHeaders := result.OldFile != "" || result.NewFile != ""
	hasHunks := false
	for j := i; j < len(lines); j++ {
		if strings.HasPrefix(lines[j], "@@") {
			hasHunks = true
			break
		}
	}

	if !hasHeaders && !hasHunks {
		return result, fmt.Errorf("invalid patch format")
	}

	// Parse hunks
	for i < len(lines) {
		line := lines[i]
		if strings.HasPrefix(line, "@@") {
			hunk, nextI, err := parseHunk(lines, i)
			if err != nil {
				return result, err
			}
			result.Hunks = append(result.Hunks, hunk)
			i = nextI
		} else {
			i++
		}
	}

	return result, nil
}

// parseHunk parses a single hunk
func parseHunk(lines []string, startIdx int) (PatchHunk, int, error) {
	header := lines[startIdx]
	re := regexp.MustCompile(`@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@`)
	matches := re.FindStringSubmatch(header)
	if matches == nil {
		return PatchHunk{}, startIdx + 1, fmt.Errorf("invalid hunk header: %s", header)
	}

	oldStart, _ := strconv.Atoi(matches[1])
	oldCount := 1
	if matches[2] != "" {
		oldCount, _ = strconv.Atoi(matches[2])
	}
	newStart, _ := strconv.Atoi(matches[3])
	newCount := 1
	if matches[4] != "" {
		newCount, _ = strconv.Atoi(matches[4])
	}

	hunk := PatchHunk{
		OldStart: oldStart,
		OldCount: oldCount,
		NewStart: newStart,
		NewCount: newCount,
		Lines:    []PatchLine{},
	}

	i := startIdx + 1
	for i < len(lines) {
		line := lines[i]
		if line == "" {
			i++
			continue
		}
		if strings.HasPrefix(line, "@@") || strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++") {
			break
		}

		if len(line) > 0 {
			op := string(line[0])
			content := ""
			if len(line) > 1 {
				content = line[1:]
			}
			if op == " " || op == "+" || op == "-" {
				hunk.Lines = append(hunk.Lines, PatchLine{Op: op, Content: content})
			}
		}
		i++
	}

	return hunk, i, nil
}
