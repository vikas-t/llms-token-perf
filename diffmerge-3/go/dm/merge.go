package dm

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

	baseLines := SplitLines(base)
	ourLines := SplitLines(ours)
	theirLines := SplitLines(theirs)

	if len(baseLines) == 0 {
		return mergeEmptyBase(ourLines, theirLines, options)
	}

	// Compute what each side did for each base line
	ourDiff := computeDiff3(baseLines, ourLines)
	theirDiff := computeDiff3(baseLines, theirLines)

	result := []string{}
	conflicts := []Conflict{}
	lineNum := 1

	for i := 0; i < len(baseLines); i++ {
		baseLine := baseLines[i]
		ourChange := ourDiff[i]
		theirChange := theirDiff[i]

		// Handle insertions BEFORE this base line (pure additions, not replacements)
		if len(ourChange.insertedBefore) > 0 || len(theirChange.insertedBefore) > 0 {
			insResult, insConf := mergeInsertionsOnly(ourChange.insertedBefore, theirChange.insertedBefore, lineNum, options)
			result = append(result, insResult...)
			if insConf != nil {
				conflicts = append(conflicts, *insConf)
			}
			lineNum += len(insResult)
		}

		// Handle the base line itself
		merged, conf := mergeBaseLine(baseLine, ourChange, theirChange, lineNum, options)
		result = append(result, merged...)
		if conf != nil {
			conflicts = append(conflicts, *conf)
		}
		lineNum += len(merged)
	}

	// Handle insertions at end
	ourChange := ourDiff[len(baseLines)]
	theirChange := theirDiff[len(baseLines)]
	if len(ourChange.insertedBefore) > 0 || len(theirChange.insertedBefore) > 0 {
		insResult, insConf := mergeInsertionsOnly(ourChange.insertedBefore, theirChange.insertedBefore, lineNum, options)
		result = append(result, insResult...)
		if insConf != nil {
			conflicts = append(conflicts, *insConf)
		}
	}

	return MergeResult{
		Content:      strings.Join(result, ""),
		HasConflicts: len(conflicts) > 0,
		Conflicts:    conflicts,
	}
}

// diff3Change represents what happened to a base line
type diff3Change struct {
	kept           bool     // Was this base line kept?
	replacement    []string // If deleted, what replaced it (can be empty for pure deletion)
	insertedBefore []string // Lines inserted BEFORE this position (pure additions)
}

// computeDiff3 computes changes from base to target for each base line
func computeDiff3(baseLines, targetLines []string) map[int]diff3Change {
	changes := make(map[int]diff3Change)

	// Initialize all positions
	for i := 0; i <= len(baseLines); i++ {
		changes[i] = diff3Change{}
	}

	lcs := computeLCS(baseLines, targetLines, false)

	// Build mapping of base lines to target lines (for kept lines)
	keptBase := make(map[int]int) // base index -> target index
	for _, match := range lcs {
		keptBase[match[0]] = match[1]
	}

	// Mark kept lines
	for baseIdx := 0; baseIdx < len(baseLines); baseIdx++ {
		if _, ok := keptBase[baseIdx]; ok {
			c := changes[baseIdx]
			c.kept = true
			changes[baseIdx] = c
		}
	}

	// Now figure out where insertions go
	// Insertions in target are lines not in LCS
	// They need to be associated with either:
	// 1. A deleted base line (as replacements)
	// 2. Before a kept line (as pure insertions)
	// 3. At end

	baseIdx := 0
	targetIdx := 0
	lcsIdx := 0

	for baseIdx < len(baseLines) || targetIdx < len(targetLines) {
		if lcsIdx < len(lcs) {
			nextBaseMatch := lcs[lcsIdx][0]
			nextTargetMatch := lcs[lcsIdx][1]

			// Process gap before this LCS match
			// Collect all target lines before nextTargetMatch
			// Collect all base lines before nextBaseMatch

			gapTargetLines := []string{}
			for targetIdx < nextTargetMatch {
				gapTargetLines = append(gapTargetLines, targetLines[targetIdx])
				targetIdx++
			}

			// Assign gap target lines to deleted base lines or as insertions before kept line
			gapBaseStart := baseIdx
			gapBaseEnd := nextBaseMatch

			if gapBaseEnd > gapBaseStart {
				// There are deleted base lines - associate target lines as replacements
				// Assign all to the first deleted base line
				for bi := gapBaseStart; bi < gapBaseEnd; bi++ {
					if bi == gapBaseStart {
						c := changes[bi]
						c.replacement = gapTargetLines
						changes[bi] = c
					}
					baseIdx++
				}
			} else {
				// No deleted base lines - these are pure insertions before the kept line
				c := changes[nextBaseMatch]
				c.insertedBefore = gapTargetLines
				changes[nextBaseMatch] = c
			}

			// Skip past the matched lines
			baseIdx++
			targetIdx++
			lcsIdx++
		} else {
			// No more LCS matches - remaining target lines go to end position
			// Remaining base lines are deleted
			gapTargetLines := []string{}
			for targetIdx < len(targetLines) {
				gapTargetLines = append(gapTargetLines, targetLines[targetIdx])
				targetIdx++
			}

			gapBaseStart := baseIdx
			gapBaseEnd := len(baseLines)

			if gapBaseEnd > gapBaseStart {
				// Deleted base lines at end - associate target lines as replacements
				for bi := gapBaseStart; bi < gapBaseEnd; bi++ {
					if bi == gapBaseStart {
						c := changes[bi]
						c.replacement = gapTargetLines
						changes[bi] = c
					}
					baseIdx++
				}
			} else {
				// Pure insertions at end
				c := changes[len(baseLines)]
				c.insertedBefore = gapTargetLines
				changes[len(baseLines)] = c
			}
			break
		}
	}

	return changes
}

// mergeBaseLine merges changes to a specific base line
func mergeBaseLine(baseLine string, ourChange, theirChange diff3Change, lineNum int, options MergeOptions) ([]string, *Conflict) {
	// Both kept
	if ourChange.kept && theirChange.kept {
		return []string{baseLine}, nil
	}

	// One kept, one deleted (with or without replacement)
	if ourChange.kept && !theirChange.kept {
		if len(theirChange.replacement) == 0 {
			// Theirs just deleted - accept deletion
			return nil, nil
		} else {
			// Theirs modified - take their modification
			return theirChange.replacement, nil
		}
	}

	if theirChange.kept && !ourChange.kept {
		if len(ourChange.replacement) == 0 {
			// Ours just deleted - accept deletion
			return nil, nil
		} else {
			// Ours modified - take our modification
			return ourChange.replacement, nil
		}
	}

	// Both deleted
	ourRep := strings.Join(ourChange.replacement, "")
	theirRep := strings.Join(theirChange.replacement, "")

	if ourRep == theirRep {
		// Same modification (or both just deleted)
		return ourChange.replacement, nil
	}

	// Different modifications - CONFLICT
	conflict := Conflict{
		Base:      baseLine,
		Ours:      ourRep,
		Theirs:    theirRep,
		StartLine: lineNum,
		EndLine:   lineNum,
	}
	return formatConflict(conflict, options), &conflict
}

func mergeInsertionsOnly(ourIns, theirIns []string, lineNum int, options MergeOptions) ([]string, *Conflict) {
	ourContent := strings.Join(ourIns, "")
	theirContent := strings.Join(theirIns, "")

	if ourContent == "" && theirContent == "" {
		return nil, nil
	}
	if ourContent == "" {
		return theirIns, nil
	}
	if theirContent == "" {
		return ourIns, nil
	}
	if ourContent == theirContent {
		return ourIns, nil
	}

	conflict := Conflict{
		Base:      "",
		Ours:      ourContent,
		Theirs:    theirContent,
		StartLine: lineNum,
		EndLine:   lineNum,
	}
	return formatConflict(conflict, options), &conflict
}

func mergeEmptyBase(ourLines, theirLines []string, options MergeOptions) MergeResult {
	if len(ourLines) == 0 && len(theirLines) == 0 {
		return MergeResult{Content: "", HasConflicts: false, Conflicts: []Conflict{}}
	}
	if len(ourLines) == 0 {
		return MergeResult{Content: strings.Join(theirLines, ""), HasConflicts: false, Conflicts: []Conflict{}}
	}
	if len(theirLines) == 0 {
		return MergeResult{Content: strings.Join(ourLines, ""), HasConflicts: false, Conflicts: []Conflict{}}
	}

	ourContent := strings.Join(ourLines, "")
	theirContent := strings.Join(theirLines, "")

	if ourContent == theirContent {
		return MergeResult{Content: ourContent, HasConflicts: false, Conflicts: []Conflict{}}
	}

	conflict := Conflict{Base: "", Ours: ourContent, Theirs: theirContent, StartLine: 1, EndLine: 1}
	result := formatConflict(conflict, options)
	return MergeResult{Content: strings.Join(result, ""), HasConflicts: true, Conflicts: []Conflict{conflict}}
}

func formatConflict(conflict Conflict, options MergeOptions) []string {
	result := []string{}

	result = append(result, "<<<<<<< "+options.OursLabel+"\n")
	if conflict.Ours != "" {
		result = append(result, SplitLines(conflict.Ours)...)
	}

	if options.ConflictStyle == "diff3" {
		result = append(result, "||||||| "+options.BaseLabel+"\n")
		if conflict.Base != "" {
			result = append(result, SplitLines(conflict.Base)...)
		}
	}

	result = append(result, "=======\n")
	if conflict.Theirs != "" {
		result = append(result, SplitLines(conflict.Theirs)...)
	}
	result = append(result, ">>>>>>> "+options.TheirsLabel+"\n")

	return result
}

func HasConflicts(content string) bool {
	return strings.Contains(content, "<<<<<<<") &&
		strings.Contains(content, "=======") &&
		strings.Contains(content, ">>>>>>>")
}

func ExtractConflicts(content string) []Conflict {
	conflicts := []Conflict{}
	lines := strings.Split(content, "\n")

	i := 0
	lineNum := 1
	for i < len(lines) {
		if strings.HasPrefix(lines[i], "<<<<<<<") {
			conflict, endI := parseConflict(lines, i)
			conflict.StartLine = lineNum
			conflict.EndLine = lineNum + (endI - i)
			conflicts = append(conflicts, conflict)
			lineNum += endI - i + 1
			i = endI + 1
		} else {
			lineNum++
			i++
		}
	}

	return conflicts
}

func parseConflict(lines []string, startI int) (Conflict, int) {
	conflict := Conflict{}
	i := startI

	if i < len(lines) && strings.HasPrefix(lines[i], "<<<<<<<") {
		i++
	}

	oursContent := []string{}
	for i < len(lines) && !strings.HasPrefix(lines[i], "|||||||") && !strings.HasPrefix(lines[i], "=======") {
		oursContent = append(oursContent, lines[i])
		i++
	}
	conflict.Ours = strings.Join(oursContent, "\n")
	if len(oursContent) > 0 {
		conflict.Ours += "\n"
	}

	if i < len(lines) && strings.HasPrefix(lines[i], "|||||||") {
		i++
		baseContent := []string{}
		for i < len(lines) && !strings.HasPrefix(lines[i], "=======") {
			baseContent = append(baseContent, lines[i])
			i++
		}
		conflict.Base = strings.Join(baseContent, "\n")
		if len(baseContent) > 0 {
			conflict.Base += "\n"
		}
	}

	if i < len(lines) && strings.HasPrefix(lines[i], "=======") {
		i++
	}

	theirsContent := []string{}
	for i < len(lines) && !strings.HasPrefix(lines[i], ">>>>>>>") {
		theirsContent = append(theirsContent, lines[i])
		i++
	}
	conflict.Theirs = strings.Join(theirsContent, "\n")
	if len(theirsContent) > 0 {
		conflict.Theirs += "\n"
	}

	return conflict, i
}

func ResolveConflict(content string, index int, resolution string) string {
	conflicts := ExtractConflicts(content)
	if index < 0 || index >= len(conflicts) {
		return content
	}

	conflict := conflicts[index]
	lines := strings.Split(content, "\n")

	conflictCount := 0
	startLine := -1
	endLine := -1

	for i := 0; i < len(lines); i++ {
		if strings.HasPrefix(lines[i], "<<<<<<<") {
			if conflictCount == index {
				startLine = i
			}
			conflictCount++
		}
		if strings.HasPrefix(lines[i], ">>>>>>>") && startLine >= 0 && endLine < 0 {
			endLine = i
			break
		}
	}

	if startLine < 0 || endLine < 0 {
		return content
	}

	var resolutionContent string
	switch resolution {
	case "ours":
		resolutionContent = strings.TrimSuffix(conflict.Ours, "\n")
	case "theirs":
		resolutionContent = strings.TrimSuffix(conflict.Theirs, "\n")
	case "base":
		resolutionContent = strings.TrimSuffix(conflict.Base, "\n")
	default:
		resolutionContent = strings.TrimSuffix(resolution, "\n")
	}

	resultLines := []string{}
	resultLines = append(resultLines, lines[:startLine]...)
	if resolutionContent != "" {
		resultLines = append(resultLines, strings.Split(resolutionContent, "\n")...)
	}
	resultLines = append(resultLines, lines[endLine+1:]...)

	return strings.Join(resultLines, "\n")
}

var conflictMarkerPattern = regexp.MustCompile(`^<<<<<<<|^=======|^>>>>>>>`)
