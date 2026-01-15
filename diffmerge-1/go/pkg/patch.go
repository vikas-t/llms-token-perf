package pkg

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// CreatePatch generates a unified diff format patch
func CreatePatch(old, new string, options PatchOptions) string {
	if options.OldFile == "" {
		options.OldFile = "a"
	}
	if options.NewFile == "" {
		options.NewFile = "b"
	}
	if options.ContextLines == 0 {
		options.ContextLines = 3
	}

	oldLines := splitIntoLines(old)
	newLines := splitIntoLines(new)

	// Compute diff
	diffOpts := DiffOptions{ContextLines: options.ContextLines}
	hunks := computeLineDiffSimple(oldLines, newLines, oldLines, newLines, diffOpts)

	// Group hunks into patch hunks
	patchHunks := groupIntoPatchHunks(hunks, oldLines, newLines, options.ContextLines)

	if len(patchHunks) == 0 {
		// No changes - minimal patch
		return fmt.Sprintf("--- %s\n+++ %s\n", options.OldFile, options.NewFile)
	}

	// Build patch string
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- %s\n", options.OldFile))
	sb.WriteString(fmt.Sprintf("+++ %s\n", options.NewFile))

	for _, hunk := range patchHunks {
		sb.WriteString(formatPatchHunk(hunk))
	}

	return sb.String()
}

// groupIntoPatchHunks groups diff hunks into patch hunks with context
func groupIntoPatchHunks(hunks []DiffHunk, oldLines, newLines []string, contextLines int) []PatchHunk {
	if len(hunks) == 0 {
		return []PatchHunk{}
	}

	// Find change regions
	type region struct {
		start int
		end   int
	}

	var changeRegions []region
	inChange := false
	var currentRegion region

	for i, h := range hunks {
		if h.Op != OpEqual {
			if !inChange {
				currentRegion = region{start: i, end: i}
				inChange = true
			} else {
				currentRegion.end = i
			}
		} else if inChange {
			changeRegions = append(changeRegions, currentRegion)
			inChange = false
		}
	}
	if inChange {
		changeRegions = append(changeRegions, currentRegion)
	}

	if len(changeRegions) == 0 {
		return []PatchHunk{}
	}

	// Merge nearby regions and add context
	mergedRegions := []region{}
	for _, r := range changeRegions {
		expandedStart := max(0, r.start-contextLines)
		expandedEnd := min(len(hunks)-1, r.end+contextLines)

		if len(mergedRegions) > 0 {
			last := &mergedRegions[len(mergedRegions)-1]
			if expandedStart <= last.end+1 {
				// Merge with previous region
				last.end = max(last.end, expandedEnd)
				continue
			}
		}
		mergedRegions = append(mergedRegions, region{start: expandedStart, end: expandedEnd})
	}

	// Convert to patch hunks
	result := []PatchHunk{}
	for _, r := range mergedRegions {
		ph := buildPatchHunk(hunks[r.start:r.end+1], oldLines, newLines)
		if len(ph.Lines) > 0 {
			result = append(result, ph)
		}
	}

	return result
}

// buildPatchHunk builds a patch hunk from diff hunks
func buildPatchHunk(hunks []DiffHunk, oldLines, newLines []string) PatchHunk {
	if len(hunks) == 0 {
		return PatchHunk{}
	}

	lines := []PatchLine{}
	oldStart := 0
	newStart := 0
	oldCount := 0
	newCount := 0
	hasSetStart := false

	for _, h := range hunks {
		switch h.Op {
		case OpEqual:
			if !hasSetStart {
				oldStart = h.OldStart
				newStart = h.NewStart
				hasSetStart = true
			}
			lines = append(lines, PatchLine{Op: " ", Content: h.Content})
			oldCount++
			newCount++
		case OpDelete:
			if !hasSetStart {
				oldStart = h.OldStart
				newStart = h.NewStart
				if newStart == 0 {
					newStart = 1
				}
				hasSetStart = true
			}
			lines = append(lines, PatchLine{Op: "-", Content: h.Content})
			oldCount++
		case OpInsert:
			if !hasSetStart {
				oldStart = h.OldStart
				if oldStart == 0 {
					oldStart = 1
				}
				newStart = h.NewStart
				hasSetStart = true
			}
			lines = append(lines, PatchLine{Op: "+", Content: h.Content})
			newCount++
		}
	}

	if oldStart == 0 {
		oldStart = 1
	}
	if newStart == 0 {
		newStart = 1
	}

	return PatchHunk{
		OldStart: oldStart,
		OldCount: oldCount,
		NewStart: newStart,
		NewCount: newCount,
		Lines:    lines,
	}
}

// formatPatchHunk formats a patch hunk as a string
func formatPatchHunk(hunk PatchHunk) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
		hunk.OldStart, hunk.OldCount, hunk.NewStart, hunk.NewCount))

	for _, line := range hunk.Lines {
		sb.WriteString(fmt.Sprintf("%s%s\n", line.Op, line.Content))
	}

	return sb.String()
}

// ApplyPatch applies a unified diff patch to content
func ApplyPatch(content, patch string) ApplyResult {
	parsed, err := doParsePatch(patch)
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

	lines := splitIntoLines(content)
	result := make([]string, 0, len(lines))
	lineIdx := 0
	hunksApplied := 0
	hunksFailed := 0
	errors := []string{}

	for _, hunk := range parsed.Hunks {
		targetLine := hunk.OldStart - 1 // Convert to 0-indexed

		// Copy lines before the hunk
		for lineIdx < targetLine && lineIdx < len(lines) {
			result = append(result, lines[lineIdx])
			lineIdx++
		}

		// Verify and apply the hunk
		if !verifyHunk(lines, lineIdx, hunk) {
			// Try fuzzy matching
			found := false
			for offset := 1; offset <= 10; offset++ {
				// Try offset before
				if targetLine-offset >= 0 && verifyHunk(lines, targetLine-offset, hunk) {
					// Copy lines up to new position
					for lineIdx < targetLine-offset {
						result = append(result, lines[lineIdx])
						lineIdx++
					}
					applyHunkLines(&result, &lineIdx, lines, hunk)
					hunksApplied++
					found = true
					break
				}
				// Try offset after
				if targetLine+offset < len(lines) && verifyHunk(lines, targetLine+offset, hunk) {
					for lineIdx < targetLine+offset {
						result = append(result, lines[lineIdx])
						lineIdx++
					}
					applyHunkLines(&result, &lineIdx, lines, hunk)
					hunksApplied++
					found = true
					break
				}
			}
			if !found {
				errors = append(errors, fmt.Sprintf("Hunk at line %d failed to apply", hunk.OldStart))
				hunksFailed++
			}
		} else {
			applyHunkLines(&result, &lineIdx, lines, hunk)
			hunksApplied++
		}
	}

	// Copy remaining lines
	for lineIdx < len(lines) {
		result = append(result, lines[lineIdx])
		lineIdx++
	}

	// Reconstruct content
	finalContent := ""
	if len(result) > 0 {
		finalContent = strings.Join(result, "\n")
		// Add trailing newline if original had one or if we have content
		if len(content) > 0 && content[len(content)-1] == '\n' {
			finalContent += "\n"
		} else if len(content) == 0 && len(result) > 0 {
			finalContent += "\n"
		}
	}

	return ApplyResult{
		Content:      finalContent,
		Success:      hunksFailed == 0,
		HunksApplied: hunksApplied,
		HunksFailed:  hunksFailed,
		Errors:       errors,
	}
}

// verifyHunk verifies that a hunk can be applied at the given position
func verifyHunk(lines []string, startIdx int, hunk PatchHunk) bool {
	idx := startIdx
	for _, pl := range hunk.Lines {
		if pl.Op == "+" {
			continue // Additions don't need to match
		}
		// Context or deletion - must match
		if idx >= len(lines) {
			return false
		}
		if lines[idx] != pl.Content {
			return false
		}
		idx++
	}
	return true
}

// applyHunkLines applies a hunk's lines to the result
func applyHunkLines(result *[]string, lineIdx *int, lines []string, hunk PatchHunk) {
	for _, pl := range hunk.Lines {
		switch pl.Op {
		case " ": // Context - copy and advance
			if *lineIdx < len(lines) {
				*result = append(*result, lines[*lineIdx])
				*lineIdx++
			}
		case "-": // Deletion - skip
			if *lineIdx < len(lines) {
				*lineIdx++
			}
		case "+": // Addition - add new line
			*result = append(*result, pl.Content)
		}
	}
}

// ReversePatch reverses a patch (swaps additions and deletions)
func ReversePatch(patch string) string {
	parsed, err := doParsePatch(patch)
	if err != nil {
		return patch
	}

	var sb strings.Builder

	// Swap file names
	sb.WriteString(fmt.Sprintf("--- %s\n", parsed.NewFile))
	sb.WriteString(fmt.Sprintf("+++ %s\n", parsed.OldFile))

	for _, hunk := range parsed.Hunks {
		// Swap old/new counts and starts
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			hunk.NewStart, hunk.NewCount, hunk.OldStart, hunk.OldCount))

		for _, line := range hunk.Lines {
			switch line.Op {
			case " ":
				sb.WriteString(fmt.Sprintf(" %s\n", line.Content))
			case "+":
				sb.WriteString(fmt.Sprintf("-%s\n", line.Content))
			case "-":
				sb.WriteString(fmt.Sprintf("+%s\n", line.Content))
			}
		}
	}

	return sb.String()
}

// ParsePatch parses a unified diff format into structured data
func ParsePatch(patch string) (ParsedPatch, error) {
	return doParsePatch(patch)
}

// doParsePatch is the internal implementation of patch parsing
func doParsePatch(patch string) (ParsedPatch, error) {
	lines := strings.Split(patch, "\n")

	result := ParsedPatch{
		OldFile: "",
		NewFile: "",
		Hunks:   []PatchHunk{},
	}

	i := 0

	// Parse file headers
	for i < len(lines) {
		line := lines[i]
		if strings.HasPrefix(line, "--- ") {
			result.OldFile = strings.TrimPrefix(line, "--- ")
			i++
			continue
		}
		if strings.HasPrefix(line, "+++ ") {
			result.NewFile = strings.TrimPrefix(line, "+++ ")
			i++
			continue
		}
		if strings.HasPrefix(line, "@@") {
			break
		}
		i++
	}

	// Parse hunks
	hunkHeaderRe := regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

	for i < len(lines) {
		line := lines[i]
		if line == "" {
			i++
			continue
		}

		matches := hunkHeaderRe.FindStringSubmatch(line)
		if matches != nil {
			hunk := PatchHunk{
				OldStart: atoi(matches[1]),
				OldCount: 1,
				NewStart: atoi(matches[3]),
				NewCount: 1,
				Lines:    []PatchLine{},
			}
			if matches[2] != "" {
				hunk.OldCount = atoi(matches[2])
			}
			if matches[4] != "" {
				hunk.NewCount = atoi(matches[4])
			}

			i++
			// Parse hunk lines
			for i < len(lines) {
				hunkLine := lines[i]
				if hunkLine == "" || strings.HasPrefix(hunkLine, "@@") {
					break
				}
				if len(hunkLine) == 0 {
					i++
					continue
				}
				op := string(hunkLine[0])
				content := ""
				if len(hunkLine) > 1 {
					content = hunkLine[1:]
				}
				if op == " " || op == "+" || op == "-" {
					hunk.Lines = append(hunk.Lines, PatchLine{Op: op, Content: content})
				}
				i++
			}

			result.Hunks = append(result.Hunks, hunk)
		} else {
			i++
		}
	}

	// Validate patch has minimum structure
	if result.OldFile == "" && result.NewFile == "" && len(result.Hunks) == 0 {
		return result, fmt.Errorf("invalid patch format")
	}

	return result, nil
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
