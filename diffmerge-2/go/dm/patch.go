package dm

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

	oldLines := SplitLines(old)
	newLines := SplitLines(new)

	// Compute the diff
	diffResult := DiffLines(old, new, DiffOptions{ContextLines: options.ContextLines})

	// If no changes, return minimal patch
	if diffResult.Stats.Additions == 0 && diffResult.Stats.Deletions == 0 {
		return fmt.Sprintf("--- %s\n+++ %s\n", options.OldFile, options.NewFile)
	}

	// Group hunks into patch hunks
	patchHunks := groupIntoPatchHunks(diffResult.Hunks, oldLines, newLines, options.ContextLines)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- %s\n", options.OldFile))
	sb.WriteString(fmt.Sprintf("+++ %s\n", options.NewFile))

	for _, hunk := range patchHunks {
		// Write hunk header
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n",
			hunk.OldStart, hunk.OldCount, hunk.NewStart, hunk.NewCount))

		// Write hunk lines
		for _, line := range hunk.Lines {
			sb.WriteString(line.Op)
			sb.WriteString(line.Content)
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

// groupIntoPatchHunks groups diff hunks into patch hunks with context
func groupIntoPatchHunks(hunks []DiffHunk, oldLines, newLines []string, contextLines int) []PatchHunk {
	if len(hunks) == 0 {
		return nil
	}

	// Find all change regions
	type changeRegion struct {
		startIdx int
		endIdx   int
	}

	var regions []changeRegion
	inChange := false
	startIdx := 0

	for i, h := range hunks {
		if h.Op != OpEqual {
			if !inChange {
				inChange = true
				startIdx = i
			}
		} else {
			if inChange {
				regions = append(regions, changeRegion{startIdx, i})
				inChange = false
			}
		}
	}
	if inChange {
		regions = append(regions, changeRegion{startIdx, len(hunks)})
	}

	if len(regions) == 0 {
		return nil
	}

	// Merge regions that are close together
	var mergedRegions []changeRegion
	current := regions[0]

	for i := 1; i < len(regions); i++ {
		// Check if regions should be merged (gap <= 2*contextLines)
		gap := regions[i].startIdx - current.endIdx
		if gap <= 2*contextLines {
			current.endIdx = regions[i].endIdx
		} else {
			mergedRegions = append(mergedRegions, current)
			current = regions[i]
		}
	}
	mergedRegions = append(mergedRegions, current)

	// Create patch hunks from merged regions
	var patchHunks []PatchHunk

	for _, region := range mergedRegions {
		var lines []PatchLine
		oldStart := 0
		newStart := 0
		oldCount := 0
		newCount := 0

		// Find the actual line numbers
		foundStart := false
		for i := max(0, region.startIdx-contextLines); i < min(len(hunks), region.endIdx+contextLines); i++ {
			h := hunks[i]

			if !foundStart {
				if h.OldStart > 0 {
					oldStart = h.OldStart
				}
				if h.NewStart > 0 {
					newStart = h.NewStart
				}
				if oldStart > 0 || newStart > 0 {
					foundStart = true
				}
			}

			switch h.Op {
			case OpEqual:
				lines = append(lines, PatchLine{Op: " ", Content: h.Content})
				oldCount++
				newCount++
			case OpDelete:
				lines = append(lines, PatchLine{Op: "-", Content: h.Content})
				oldCount++
			case OpInsert:
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

		// Adjust start for context
		contextBefore := 0
		for i := region.startIdx - 1; i >= 0 && contextBefore < contextLines; i-- {
			if hunks[i].Op == OpEqual {
				contextBefore++
			}
		}

		if len(lines) > 0 {
			patchHunks = append(patchHunks, PatchHunk{
				OldStart: max(1, oldStart-contextBefore),
				OldCount: oldCount,
				NewStart: max(1, newStart-contextBefore),
				NewCount: newCount,
				Lines:    lines,
			})
		}
	}

	return patchHunks
}

// ParsePatch parses unified diff format into structured data
func ParsePatch(patch string) (ParsedPatch, error) {
	lines := strings.Split(patch, "\n")

	result := ParsedPatch{
		OldFile: "",
		NewFile: "",
		Hunks:   []PatchHunk{},
	}

	hunkHeaderRe := regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

	var currentHunk *PatchHunk

	for _, line := range lines {
		if strings.HasPrefix(line, "--- ") {
			result.OldFile = strings.TrimPrefix(line, "--- ")
		} else if strings.HasPrefix(line, "+++ ") {
			result.NewFile = strings.TrimPrefix(line, "+++ ")
		} else if matches := hunkHeaderRe.FindStringSubmatch(line); matches != nil {
			if currentHunk != nil {
				result.Hunks = append(result.Hunks, *currentHunk)
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

			currentHunk = &PatchHunk{
				OldStart: oldStart,
				OldCount: oldCount,
				NewStart: newStart,
				NewCount: newCount,
				Lines:    []PatchLine{},
			}
		} else if currentHunk != nil && len(line) > 0 {
			op := string(line[0])
			content := ""
			if len(line) > 1 {
				content = line[1:]
			}

			if op == " " || op == "+" || op == "-" {
				currentHunk.Lines = append(currentHunk.Lines, PatchLine{
					Op:      op,
					Content: content,
				})
			}
		}
	}

	if currentHunk != nil {
		result.Hunks = append(result.Hunks, *currentHunk)
	}

	if result.OldFile == "" && result.NewFile == "" && len(result.Hunks) == 0 {
		return result, fmt.Errorf("invalid patch format")
	}

	return result, nil
}

// ApplyPatch applies a unified diff patch to content
func ApplyPatch(content, patch string) ApplyResult {
	parsed, err := ParsePatch(patch)
	if err != nil {
		return ApplyResult{
			Content:      content,
			Success:      false,
			HunksApplied: 0,
			HunksFailed:  0,
			Errors:       []string{err.Error()},
		}
	}

	// If no hunks, it's a no-op patch
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
	hadTrailingNewline := strings.HasSuffix(content, "\n")

	result := make([]string, 0, len(lines))
	lineIdx := 0
	hunksApplied := 0
	hunksFailed := 0
	errors := []string{}

	for _, hunk := range parsed.Hunks {
		targetLine := hunk.OldStart - 1 // Convert to 0-indexed

		// Copy lines before this hunk
		for lineIdx < targetLine && lineIdx < len(lines) {
			result = append(result, lines[lineIdx])
			lineIdx++
		}

		// Verify and apply hunk
		success := true
		expectedIdx := 0

		// First verify all context and delete lines match
		for _, patchLine := range hunk.Lines {
			if patchLine.Op == " " || patchLine.Op == "-" {
				checkIdx := targetLine + expectedIdx
				if checkIdx >= len(lines) || lines[checkIdx] != patchLine.Content {
					success = false
					break
				}
				expectedIdx++
			}
		}

		if success {
			// Apply the hunk
			for _, patchLine := range hunk.Lines {
				switch patchLine.Op {
				case " ":
					result = append(result, patchLine.Content)
					lineIdx++
				case "-":
					lineIdx++
				case "+":
					result = append(result, patchLine.Content)
				}
			}
			hunksApplied++
		} else {
			// Hunk failed - try with offset
			applied := tryApplyWithOffset(lines, lineIdx, hunk, &result)
			if applied {
				// Update lineIdx based on what was consumed
				for _, patchLine := range hunk.Lines {
					if patchLine.Op == " " || patchLine.Op == "-" {
						lineIdx++
					}
				}
				hunksApplied++
			} else {
				hunksFailed++
				errors = append(errors, fmt.Sprintf("Hunk at line %d failed to apply", hunk.OldStart))
			}
		}
	}

	// Copy remaining lines
	for lineIdx < len(lines) {
		result = append(result, lines[lineIdx])
		lineIdx++
	}

	// Reconstruct content
	var finalContent string
	if len(result) > 0 {
		finalContent = strings.Join(result, "\n")
		if hadTrailingNewline || (len(parsed.Hunks) > 0) {
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

// tryApplyWithOffset attempts to apply a hunk with fuzzy matching
func tryApplyWithOffset(lines []string, startIdx int, hunk PatchHunk, result *[]string) bool {
	// Try different offsets
	for offset := -3; offset <= 3; offset++ {
		targetLine := startIdx + offset
		if targetLine < 0 {
			continue
		}

		// Verify hunk at this offset
		success := true
		checkIdx := targetLine
		for _, patchLine := range hunk.Lines {
			if patchLine.Op == " " || patchLine.Op == "-" {
				if checkIdx >= len(lines) || lines[checkIdx] != patchLine.Content {
					success = false
					break
				}
				checkIdx++
			}
		}

		if success {
			// Apply at this offset
			for _, patchLine := range hunk.Lines {
				switch patchLine.Op {
				case " ":
					*result = append(*result, patchLine.Content)
				case "-":
					// Skip this line
				case "+":
					*result = append(*result, patchLine.Content)
				}
			}
			return true
		}
	}

	return false
}

// ReversePatch reverses a patch (swap additions and deletions)
func ReversePatch(patch string) string {
	lines := strings.Split(patch, "\n")
	var result []string

	hunkHeaderRe := regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$`)

	for _, line := range lines {
		if strings.HasPrefix(line, "--- ") {
			result = append(result, "+++ "+strings.TrimPrefix(line, "--- "))
		} else if strings.HasPrefix(line, "+++ ") {
			result = append(result, "--- "+strings.TrimPrefix(line, "+++ "))
		} else if matches := hunkHeaderRe.FindStringSubmatch(line); matches != nil {
			// Swap old and new in hunk header
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
			suffix := matches[5]

			result = append(result, fmt.Sprintf("@@ -%s,%s +%s,%s @@%s",
				newStart, newCount, oldStart, oldCount, suffix))
		} else if len(line) > 0 {
			switch line[0] {
			case '+':
				result = append(result, "-"+line[1:])
			case '-':
				result = append(result, "+"+line[1:])
			default:
				result = append(result, line)
			}
		} else {
			result = append(result, line)
		}
	}

	return strings.Join(result, "\n")
}
