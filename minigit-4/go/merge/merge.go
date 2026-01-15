package merge

import (
	"fmt"
	"minigit/diff"
	"strings"
)

// MergeResult represents the result of a three-way merge
type MergeResult struct {
	Content   string
	Conflicts bool
}

// ThreeWayMerge performs a three-way merge of file contents
func ThreeWayMerge(base, ours, theirs, oursLabel, theirsLabel string) MergeResult {
	// If ours equals base, take theirs
	if ours == base {
		return MergeResult{Content: theirs, Conflicts: false}
	}

	// If theirs equals base, take ours
	if theirs == base {
		return MergeResult{Content: ours, Conflicts: false}
	}

	// If ours equals theirs, take either
	if ours == theirs {
		return MergeResult{Content: ours, Conflicts: false}
	}

	// Need to do a real three-way merge
	baseLines := splitLines(base)
	oursLines := splitLines(ours)
	theirsLines := splitLines(theirs)

	// Use diff to find changes
	oursDiff := diff.Myers(baseLines, oursLines)
	theirsDiff := diff.Myers(baseLines, theirsLines)

	// Simple merge strategy: line-by-line
	result, conflicts := mergeLines(baseLines, oursLines, theirsLines, oursDiff, theirsDiff, oursLabel, theirsLabel)

	return MergeResult{
		Content:   strings.Join(result, "\n") + "\n",
		Conflicts: conflicts,
	}
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	// Remove empty last line if content ends with newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func mergeLines(base, ours, theirs []string, oursDiff, theirsDiff []diff.DiffLine, oursLabel, theirsLabel string) ([]string, bool) {
	// Simple merge: compare each line position
	maxLen := max(len(ours), len(theirs))
	maxLen = max(maxLen, len(base))

	var result []string
	conflicts := false

	// Build maps of what changed
	oursChanges := make(map[int]string)
	theirsChanges := make(map[int]string)
	oursDeletes := make(map[int]bool)
	theirsDeletes := make(map[int]bool)

	// Track position in base for our changes
	baseIdx := 0
	for _, dl := range oursDiff {
		switch dl.Type {
		case diff.Context:
			baseIdx++
		case diff.Add:
			oursChanges[baseIdx] = dl.Content
		case diff.Remove:
			oursDeletes[baseIdx] = true
			baseIdx++
		}
	}

	// Track position in base for their changes
	baseIdx = 0
	for _, dl := range theirsDiff {
		switch dl.Type {
		case diff.Context:
			baseIdx++
		case diff.Add:
			theirsChanges[baseIdx] = dl.Content
		case diff.Remove:
			theirsDeletes[baseIdx] = true
			baseIdx++
		}
	}

	// Now merge
	for i := 0; i < maxLen; i++ {
		// Get values at position i
		var baseVal, oursVal, theirsVal string
		hasBase := i < len(base)
		hasOurs := i < len(ours)
		hasTheirs := i < len(theirs)

		if hasBase {
			baseVal = base[i]
		}
		if hasOurs {
			oursVal = ours[i]
		}
		if hasTheirs {
			theirsVal = theirs[i]
		}

		// Case 1: All same
		if hasOurs && hasTheirs && oursVal == theirsVal {
			result = append(result, oursVal)
			continue
		}

		// Case 2: Only ours changed from base
		if hasBase && hasOurs && hasTheirs {
			if oursVal != baseVal && theirsVal == baseVal {
				result = append(result, oursVal)
				continue
			}
			if theirsVal != baseVal && oursVal == baseVal {
				result = append(result, theirsVal)
				continue
			}
		}

		// Case 3: Only one side has value
		if hasOurs && !hasTheirs {
			result = append(result, oursVal)
			continue
		}
		if hasTheirs && !hasOurs {
			result = append(result, theirsVal)
			continue
		}

		// Case 4: Conflict - both sides changed differently
		if hasOurs && hasTheirs && oursVal != theirsVal {
			conflicts = true
			result = append(result, fmt.Sprintf("<<<<<<< %s", oursLabel))
			result = append(result, oursVal)
			result = append(result, "=======")
			result = append(result, theirsVal)
			result = append(result, fmt.Sprintf(">>>>>>> %s", theirsLabel))
			continue
		}

		// Default: take whatever we have
		if hasOurs {
			result = append(result, oursVal)
		} else if hasTheirs {
			result = append(result, theirsVal)
		}
	}

	return result, conflicts
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// FindMergeBase finds the common ancestor of two commits
func FindMergeBase(parents1, parents2 map[string]bool) string {
	// Simple BFS to find common ancestor
	for sha := range parents1 {
		if parents2[sha] {
			return sha
		}
	}
	return ""
}

// GetAllAncestors returns all ancestors of a commit
func GetAllAncestors(getParents func(sha string) ([]string, error), sha string) (map[string]bool, error) {
	ancestors := make(map[string]bool)
	toVisit := []string{sha}

	for len(toVisit) > 0 {
		current := toVisit[0]
		toVisit = toVisit[1:]

		if ancestors[current] {
			continue
		}
		ancestors[current] = true

		parents, err := getParents(current)
		if err != nil {
			continue // No more parents
		}
		toVisit = append(toVisit, parents...)
	}

	return ancestors, nil
}
