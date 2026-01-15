package pkg

import (
	"regexp"
	"strings"
)

// Merge3 performs a three-way merge with conflict detection
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

	baseLines := splitIntoLines(base)
	ourLines := splitIntoLines(ours)
	theirLines := splitIntoLines(theirs)

	// Compute diffs from base to ours and base to theirs
	ourDiff := computeDiff(baseLines, ourLines)
	theirDiff := computeDiff(baseLines, theirLines)

	result := []string{}
	conflicts := []Conflict{}

	baseIdx := 0
	ourIdx := 0
	theirIdx := 0

	for baseIdx < len(baseLines) || ourIdx < len(ourLines) || theirIdx < len(theirLines) {
		// Get changes at current base position
		ourChange, ourHasChange := ourDiff[baseIdx]
		theirChange, theirHasChange := theirDiff[baseIdx]

		// If no entry in diff map, treat as no change
		if !ourHasChange {
			ourChange = lineChange{typ: "same", newLines: []string{}}
		}
		if !theirHasChange {
			theirChange = lineChange{typ: "same", newLines: []string{}}
		}

		// Both unchanged at this position
		if ourChange.typ == "same" && theirChange.typ == "same" {
			if baseIdx < len(baseLines) {
				result = append(result, baseLines[baseIdx])
			}
			baseIdx++
			ourIdx++
			theirIdx++
			continue
		}

		// Only ours changed
		if ourChange.typ != "same" && theirChange.typ == "same" {
			result = append(result, ourChange.newLines...)
			if ourChange.typ == "delete" || ourChange.typ == "modify" {
				baseIdx++
				theirIdx++
			}
			ourIdx += len(ourChange.newLines)
			if ourChange.typ == "delete" {
				ourIdx = ourChange.ourEndIdx
			}
			continue
		}

		// Only theirs changed
		if ourChange.typ == "same" && theirChange.typ != "same" {
			result = append(result, theirChange.newLines...)
			if theirChange.typ == "delete" || theirChange.typ == "modify" {
				baseIdx++
				ourIdx++
			}
			theirIdx += len(theirChange.newLines)
			if theirChange.typ == "delete" {
				theirIdx = theirChange.theirEndIdx
			}
			continue
		}

		// Both changed - check if same change
		if sameChange(ourChange.newLines, theirChange.newLines) {
			result = append(result, ourChange.newLines...)
			if ourChange.typ == "delete" || ourChange.typ == "modify" {
				baseIdx++
			}
			ourIdx += len(ourChange.newLines)
			theirIdx += len(theirChange.newLines)
			continue
		}

		// Conflict
		basePart := ""
		if baseIdx < len(baseLines) {
			basePart = baseLines[baseIdx]
		}
		conflict := Conflict{
			Base:      basePart,
			Ours:      strings.Join(ourChange.newLines, "\n"),
			Theirs:    strings.Join(theirChange.newLines, "\n"),
			StartLine: len(result) + 1,
		}
		result = append(result, createConflictLines(ourChange.newLines, theirChange.newLines, []string{basePart}, options)...)
		conflict.EndLine = len(result)
		conflicts = append(conflicts, conflict)

		if ourChange.typ == "delete" || ourChange.typ == "modify" {
			baseIdx++
		}
		ourIdx += len(ourChange.newLines)
		theirIdx += len(theirChange.newLines)
		if ourChange.typ == "delete" {
			ourIdx = ourChange.ourEndIdx
		}
		if theirChange.typ == "delete" {
			theirIdx = theirChange.theirEndIdx
		}
	}

	// Reconstruct content
	content := ""
	if len(result) > 0 {
		content = strings.Join(result, "\n")
		if (len(base) > 0 && base[len(base)-1] == '\n') ||
			(len(ours) > 0 && ours[len(ours)-1] == '\n') ||
			(len(theirs) > 0 && theirs[len(theirs)-1] == '\n') {
			content += "\n"
		}
	}

	return MergeResult{
		Content:      content,
		HasConflicts: len(conflicts) > 0,
		Conflicts:    conflicts,
	}
}

type lineChange struct {
	typ        string   // "same", "insert", "delete", "modify"
	newLines   []string
	ourEndIdx   int
	theirEndIdx int
}

// computeDiff creates a map of what changed at each base position
func computeDiff(base, other []string) map[int]lineChange {
	lcs := computeLCS(base, other)
	changes := make(map[int]lineChange)

	baseIdx := 0
	otherIdx := 0
	lcsIdx := 0

	for baseIdx < len(base) {
		// Check if base[baseIdx] is in LCS at current position
		inLCS := lcsIdx < len(lcs) && base[baseIdx] == lcs[lcsIdx]

		if inLCS {
			// Check if other also has this line at current position
			if otherIdx < len(other) && other[otherIdx] == base[baseIdx] {
				// Same line
				changes[baseIdx] = lineChange{typ: "same", newLines: []string{base[baseIdx]}}
				baseIdx++
				otherIdx++
				lcsIdx++
			} else {
				// Other has insertions before this line
				inserted := []string{}
				for otherIdx < len(other) && other[otherIdx] != base[baseIdx] {
					inserted = append(inserted, other[otherIdx])
					otherIdx++
				}
				if len(inserted) > 0 {
					changes[baseIdx] = lineChange{typ: "insert", newLines: inserted}
				}
				// Don't increment baseIdx - will catch up next iteration
				continue
			}
		} else {
			// Base line was deleted or modified
			// Look for what replaced it in other
			newLines := []string{}
			for otherIdx < len(other) {
				// Check if this other line will match an upcoming base line
				found := false
				for bi := baseIdx + 1; bi < len(base); bi++ {
					if base[bi] == other[otherIdx] {
						found = true
						break
					}
				}
				if found {
					break
				}
				newLines = append(newLines, other[otherIdx])
				otherIdx++
			}

			if len(newLines) == 0 {
				changes[baseIdx] = lineChange{typ: "delete", newLines: []string{}, ourEndIdx: otherIdx, theirEndIdx: otherIdx}
			} else {
				changes[baseIdx] = lineChange{typ: "modify", newLines: newLines}
			}
			baseIdx++
		}
	}

	// Handle insertions at end
	if otherIdx < len(other) {
		inserted := []string{}
		for otherIdx < len(other) {
			inserted = append(inserted, other[otherIdx])
			otherIdx++
		}
		changes[baseIdx] = lineChange{typ: "insert", newLines: inserted}
	}

	return changes
}

func sameChange(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func createConflictLines(ours, theirs, base []string, options MergeOptions) []string {
	result := []string{}
	result = append(result, "<<<<<<< "+options.OursLabel)
	result = append(result, ours...)
	if options.ConflictStyle == "diff3" {
		result = append(result, "||||||| "+options.BaseLabel)
		result = append(result, base...)
	}
	result = append(result, "=======")
	result = append(result, theirs...)
	result = append(result, ">>>>>>> "+options.TheirsLabel)
	return result
}

// HasConflicts checks if content contains conflict markers
func HasConflicts(content string) bool {
	return strings.Contains(content, "<<<<<<<") &&
		strings.Contains(content, "=======") &&
		strings.Contains(content, ">>>>>>>")
}

// ExtractConflicts extracts conflict regions from merged content
func ExtractConflicts(content string) []Conflict {
	conflicts := []Conflict{}
	lines := strings.Split(content, "\n")

	conflictStart := regexp.MustCompile(`^<<<<<<<`)
	baseStart := regexp.MustCompile(`^\|\|\|\|\|\|\|`)
	separator := regexp.MustCompile(`^=======`)
	conflictEnd := regexp.MustCompile(`^>>>>>>>`)

	i := 0
	for i < len(lines) {
		if conflictStart.MatchString(lines[i]) {
			conflict := Conflict{
				StartLine: i + 1,
				Ours:      "",
				Base:      "",
				Theirs:    "",
			}

			i++
			oursLines := []string{}
			for i < len(lines) && !baseStart.MatchString(lines[i]) && !separator.MatchString(lines[i]) {
				oursLines = append(oursLines, lines[i])
				i++
			}
			conflict.Ours = strings.Join(oursLines, "\n")

			if i < len(lines) && baseStart.MatchString(lines[i]) {
				i++
				baseLines := []string{}
				for i < len(lines) && !separator.MatchString(lines[i]) {
					baseLines = append(baseLines, lines[i])
					i++
				}
				conflict.Base = strings.Join(baseLines, "\n")
			}

			if i < len(lines) && separator.MatchString(lines[i]) {
				i++
			}

			theirsLines := []string{}
			for i < len(lines) && !conflictEnd.MatchString(lines[i]) {
				theirsLines = append(theirsLines, lines[i])
				i++
			}
			conflict.Theirs = strings.Join(theirsLines, "\n")

			if i < len(lines) && conflictEnd.MatchString(lines[i]) {
				conflict.EndLine = i + 1
				i++
			}

			conflicts = append(conflicts, conflict)
		} else {
			i++
		}
	}

	return conflicts
}

// ResolveConflict resolves a specific conflict in the content
func ResolveConflict(content string, index int, resolution string) string {
	conflicts := ExtractConflicts(content)
	if index < 0 || index >= len(conflicts) {
		return content
	}

	conflict := conflicts[index]
	lines := strings.Split(content, "\n")
	startIdx := conflict.StartLine - 1
	endIdx := conflict.EndLine - 1

	var resolutionLines []string
	switch resolution {
	case "ours":
		resolutionLines = strings.Split(conflict.Ours, "\n")
		if len(resolutionLines) == 1 && resolutionLines[0] == "" {
			resolutionLines = []string{}
		}
	case "theirs":
		resolutionLines = strings.Split(conflict.Theirs, "\n")
		if len(resolutionLines) == 1 && resolutionLines[0] == "" {
			resolutionLines = []string{}
		}
	case "base":
		resolutionLines = strings.Split(conflict.Base, "\n")
		if len(resolutionLines) == 1 && resolutionLines[0] == "" {
			resolutionLines = []string{}
		}
	default:
		resolutionLines = strings.Split(resolution, "\n")
		if len(resolutionLines) > 0 && resolutionLines[len(resolutionLines)-1] == "" {
			resolutionLines = resolutionLines[:len(resolutionLines)-1]
		}
	}

	resultLines := make([]string, 0, len(lines))
	resultLines = append(resultLines, lines[:startIdx]...)
	resultLines = append(resultLines, resolutionLines...)
	if endIdx+1 < len(lines) {
		resultLines = append(resultLines, lines[endIdx+1:]...)
	}

	return strings.Join(resultLines, "\n")
}
