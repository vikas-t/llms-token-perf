package dm

import (
	"regexp"
	"strings"
)

// Merge3 performs a three-way merge
func Merge3(base, ours, theirs string, options MergeOptions) MergeResult {
	if options.ConflictStyle == "" {
		options.ConflictStyle = "merge"
	}
	if options.OursLabel == "" {
		options.OursLabel = "ours"
	}
	if options.TheirsLabel == "" {
		options.TheirsLabel = "theirs"
	}
	if options.BaseLabel == "" {
		options.BaseLabel = "base"
	}

	baseLines := SplitLines(base)
	ourLines := SplitLines(ours)
	theirLines := SplitLines(theirs)

	// Compute diffs from base to each side
	baseLCS := lcs(baseLines, ourLines)
	baseLCS2 := lcs(baseLines, theirLines)

	// Build change maps
	ourChanges := computeChanges(baseLines, ourLines, baseLCS)
	theirChanges := computeChanges(baseLines, theirLines, baseLCS2)

	var resultLines []string
	var conflicts []Conflict
	hasConflicts := false

	baseIdx := 0
	ourIdx := 0
	theirIdx := 0

	for baseIdx < len(baseLines) || ourIdx < len(ourLines) || theirIdx < len(theirLines) {
		// Check if both sides have changes at current base position
		ourChange := getChangeAt(ourChanges, baseIdx)
		theirChange := getChangeAt(theirChanges, baseIdx)

		// Also check for overlapping changes
		if ourChange != nil && theirChange == nil {
			// Check if our change overlaps with any of their changes
			theirChange = getOverlappingChange(theirChanges, ourChange.baseStart, ourChange.baseStart+ourChange.baseCount)
		}
		if theirChange != nil && ourChange == nil {
			// Check if their change overlaps with any of our changes
			ourChange = getOverlappingChange(ourChanges, theirChange.baseStart, theirChange.baseStart+theirChange.baseCount)
		}

		if ourChange == nil && theirChange == nil {
			// No changes - take base if available
			if baseIdx < len(baseLines) {
				resultLines = append(resultLines, baseLines[baseIdx])
				baseIdx++
				ourIdx++
				theirIdx++
			} else {
				break
			}
		} else if ourChange != nil && theirChange == nil {
			// Only our side changed
			for _, line := range ourChange.newLines {
				resultLines = append(resultLines, line)
			}
			baseIdx += ourChange.baseCount
			ourIdx += len(ourChange.newLines)
			theirIdx += ourChange.baseCount
		} else if ourChange == nil && theirChange != nil {
			// Only their side changed
			for _, line := range theirChange.newLines {
				resultLines = append(resultLines, line)
			}
			baseIdx += theirChange.baseCount
			ourIdx += theirChange.baseCount
			theirIdx += len(theirChange.newLines)
		} else {
			// Both sides changed - check if same change
			if sameChange(ourChange, theirChange) {
				// Same change - take one
				for _, line := range ourChange.newLines {
					resultLines = append(resultLines, line)
				}
				baseIdx += ourChange.baseCount
				ourIdx += len(ourChange.newLines)
				theirIdx += len(theirChange.newLines)
			} else {
				// Conflict
				hasConflicts = true

				startLine := len(resultLines) + 1

				// Add conflict markers
				resultLines = append(resultLines, "<<<<<<< "+options.OursLabel)
				for _, line := range ourChange.newLines {
					resultLines = append(resultLines, line)
				}

				if options.ConflictStyle == "diff3" {
					resultLines = append(resultLines, "||||||| "+options.BaseLabel)
					for i := baseIdx; i < baseIdx+ourChange.baseCount && i < len(baseLines); i++ {
						resultLines = append(resultLines, baseLines[i])
					}
				}

				resultLines = append(resultLines, "=======")
				for _, line := range theirChange.newLines {
					resultLines = append(resultLines, line)
				}
				resultLines = append(resultLines, ">>>>>>> "+options.TheirsLabel)

				endLine := len(resultLines)

				conflicts = append(conflicts, Conflict{
					Base:      strings.Join(getBaseLines(baseLines, baseIdx, ourChange.baseCount), "\n"),
					Ours:      strings.Join(ourChange.newLines, "\n"),
					Theirs:    strings.Join(theirChange.newLines, "\n"),
					StartLine: startLine,
					EndLine:   endLine,
				})

				baseIdx += max(ourChange.baseCount, theirChange.baseCount)
				ourIdx += len(ourChange.newLines)
				theirIdx += len(theirChange.newLines)
			}
		}
	}

	// Handle trailing content
	for ourIdx < len(ourLines) {
		resultLines = append(resultLines, ourLines[ourIdx])
		ourIdx++
	}

	content := ""
	if len(resultLines) > 0 {
		content = strings.Join(resultLines, "\n") + "\n"
	}

	return MergeResult{
		Content:      content,
		HasConflicts: hasConflicts,
		Conflicts:    conflicts,
	}
}

type change struct {
	baseStart int
	baseCount int
	newLines  []string
}

func computeChanges(baseLines, newLines []string, common []string) []change {
	var changes []change

	baseIdx := 0
	newIdx := 0
	commonIdx := 0

	for commonIdx < len(common) {
		// Find next common line in base
		baseNext := -1
		for i := baseIdx; i < len(baseLines); i++ {
			if baseLines[i] == common[commonIdx] {
				baseNext = i
				break
			}
		}

		// Find next common line in new
		newNext := -1
		for i := newIdx; i < len(newLines); i++ {
			if newLines[i] == common[commonIdx] {
				newNext = i
				break
			}
		}

		// Check if there are changes before common line
		if baseNext > baseIdx || newNext > newIdx {
			changes = append(changes, change{
				baseStart: baseIdx,
				baseCount: baseNext - baseIdx,
				newLines:  newLines[newIdx:newNext],
			})
		}

		baseIdx = baseNext + 1
		newIdx = newNext + 1
		commonIdx++
	}

	// Handle remaining lines
	if baseIdx < len(baseLines) || newIdx < len(newLines) {
		changes = append(changes, change{
			baseStart: baseIdx,
			baseCount: len(baseLines) - baseIdx,
			newLines:  newLines[newIdx:],
		})
	}

	return changes
}

func getChangeAt(changes []change, baseIdx int) *change {
	for i := range changes {
		if changes[i].baseStart == baseIdx {
			return &changes[i]
		}
		if changes[i].baseStart <= baseIdx && baseIdx < changes[i].baseStart+changes[i].baseCount {
			return &changes[i]
		}
	}
	return nil
}

// changesOverlap checks if two changes overlap in base range
func changesOverlap(a, b *change) bool {
	if a == nil || b == nil {
		return false
	}
	aEnd := a.baseStart + a.baseCount
	bEnd := b.baseStart + b.baseCount
	// Overlap if ranges intersect
	return a.baseStart < bEnd && b.baseStart < aEnd
}

// getOverlappingChange finds any change that overlaps with given base range
func getOverlappingChange(changes []change, baseStart, baseEnd int) *change {
	for i := range changes {
		cEnd := changes[i].baseStart + changes[i].baseCount
		if changes[i].baseStart < baseEnd && baseStart < cEnd {
			return &changes[i]
		}
	}
	return nil
}

func sameChange(a, b *change) bool {
	if a.baseCount != b.baseCount {
		return false
	}
	if len(a.newLines) != len(b.newLines) {
		return false
	}
	for i := range a.newLines {
		if a.newLines[i] != b.newLines[i] {
			return false
		}
	}
	return true
}

func getBaseLines(baseLines []string, start, count int) []string {
	end := start + count
	if end > len(baseLines) {
		end = len(baseLines)
	}
	if start >= len(baseLines) {
		return []string{}
	}
	return baseLines[start:end]
}

// HasConflicts checks if content contains conflict markers
func HasConflicts(content string) bool {
	return strings.Contains(content, "<<<<<<<") &&
		strings.Contains(content, "=======") &&
		strings.Contains(content, ">>>>>>>")
}

// ExtractConflicts extracts conflict regions from merged content
func ExtractConflicts(content string) []Conflict {
	var conflicts []Conflict

	lines := strings.Split(content, "\n")

	oursMarkerRe := regexp.MustCompile(`^<<<<<<<`)
	baseMarkerRe := regexp.MustCompile(`^\|\|\|\|\|\|\|`)
	separatorRe := regexp.MustCompile(`^=======`)
	theirsMarkerRe := regexp.MustCompile(`^>>>>>>>`)

	i := 0
	for i < len(lines) {
		if oursMarkerRe.MatchString(lines[i]) {
			startLine := i + 1
			var oursLines, baseLines, theirsLines []string

			i++
			// Collect ours lines
			for i < len(lines) && !baseMarkerRe.MatchString(lines[i]) && !separatorRe.MatchString(lines[i]) {
				oursLines = append(oursLines, lines[i])
				i++
			}

			// Check for base section (diff3 style)
			if i < len(lines) && baseMarkerRe.MatchString(lines[i]) {
				i++
				for i < len(lines) && !separatorRe.MatchString(lines[i]) {
					baseLines = append(baseLines, lines[i])
					i++
				}
			}

			// Skip separator
			if i < len(lines) && separatorRe.MatchString(lines[i]) {
				i++
			}

			// Collect theirs lines
			for i < len(lines) && !theirsMarkerRe.MatchString(lines[i]) {
				theirsLines = append(theirsLines, lines[i])
				i++
			}

			endLine := i + 1

			conflicts = append(conflicts, Conflict{
				Base:      strings.Join(baseLines, "\n"),
				Ours:      strings.Join(oursLines, "\n"),
				Theirs:    strings.Join(theirsLines, "\n"),
				StartLine: startLine,
				EndLine:   endLine,
			})
		}
		i++
	}

	return conflicts
}

// ResolveConflict resolves a specific conflict in the content
func ResolveConflict(content string, index int, resolution string) string {
	conflicts := ExtractConflicts(content)

	if index < 0 || index >= len(conflicts) {
		return content
	}

	lines := strings.Split(content, "\n")
	conflict := conflicts[index]

	// Determine replacement content
	var replacement string
	switch resolution {
	case "ours":
		replacement = conflict.Ours
	case "theirs":
		replacement = conflict.Theirs
	case "base":
		replacement = conflict.Base
	default:
		replacement = resolution
	}

	// Find the conflict markers in the original content
	oursMarkerRe := regexp.MustCompile(`^<<<<<<<`)
	theirsMarkerRe := regexp.MustCompile(`^>>>>>>>`)

	// Find the nth conflict
	conflictCount := 0
	startIdx := -1
	endIdx := -1

	for i, line := range lines {
		if oursMarkerRe.MatchString(line) {
			if conflictCount == index {
				startIdx = i
			}
			conflictCount++
		}
		if theirsMarkerRe.MatchString(line) && startIdx != -1 && endIdx == -1 {
			endIdx = i
			break
		}
	}

	if startIdx == -1 || endIdx == -1 {
		return content
	}

	// Replace the conflict
	var result []string
	result = append(result, lines[:startIdx]...)

	if replacement != "" {
		replacementLines := strings.Split(replacement, "\n")
		result = append(result, replacementLines...)
	}

	result = append(result, lines[endIdx+1:]...)

	return strings.Join(result, "\n")
}
