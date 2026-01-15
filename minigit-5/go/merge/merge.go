package merge

import (
	"fmt"
	"minigit/diff"
	"minigit/objects"
	"minigit/refs"
	"strings"
)

// MergeResult represents the result of a merge operation
type MergeResult struct {
	FastForward bool
	Conflicts   []string
	MergedFiles map[string][]byte
	TreeSHA     string
}

// FindMergeBase finds the common ancestor of two commits
func FindMergeBase(gitDir, sha1, sha2 string) (string, error) {
	// Get all ancestors of sha1
	ancestors1, err := getAncestors(gitDir, sha1)
	if err != nil {
		return "", err
	}

	// Find first ancestor of sha2 that's also ancestor of sha1
	queue := []string{sha2}
	visited := make(map[string]bool)

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current] {
			continue
		}
		visited[current] = true

		if ancestors1[current] {
			return current, nil
		}

		// Add parents to queue
		objType, data, err := objects.ReadObject(gitDir, current)
		if err != nil {
			continue
		}

		if objType != objects.TypeCommit {
			continue
		}

		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	return "", fmt.Errorf("no common ancestor found")
}

func getAncestors(gitDir, sha string) (map[string]bool, error) {
	ancestors := make(map[string]bool)
	queue := []string{sha}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if ancestors[current] {
			continue
		}
		ancestors[current] = true

		objType, data, err := objects.ReadObject(gitDir, current)
		if err != nil {
			continue
		}

		if objType != objects.TypeCommit {
			continue
		}

		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	return ancestors, nil
}

// IsAncestor checks if ancestor is an ancestor of descendant
func IsAncestor(gitDir, ancestor, descendant string) (bool, error) {
	ancestors, err := getAncestors(gitDir, descendant)
	if err != nil {
		return false, err
	}
	return ancestors[ancestor], nil
}

// ThreeWayMerge performs a three-way merge
func ThreeWayMerge(gitDir, oursSHA, theirsSHA, baseSHA string) (*MergeResult, error) {
	result := &MergeResult{
		MergedFiles: make(map[string][]byte),
	}

	// Read trees
	oursTree, err := objects.GetTreeSHAFromCommit(gitDir, oursSHA)
	if err != nil {
		return nil, err
	}

	theirsTree, err := objects.GetTreeSHAFromCommit(gitDir, theirsSHA)
	if err != nil {
		return nil, err
	}

	baseTree := ""
	if baseSHA != "" {
		baseTree, err = objects.GetTreeSHAFromCommit(gitDir, baseSHA)
		if err != nil {
			return nil, err
		}
	}

	// Get all files from all trees
	oursFiles, err := objects.ReadTreeRecursive(gitDir, oursTree, "")
	if err != nil {
		return nil, err
	}

	theirsFiles, err := objects.ReadTreeRecursive(gitDir, theirsTree, "")
	if err != nil {
		return nil, err
	}

	baseFiles := make(map[string]string)
	if baseTree != "" {
		baseFiles, err = objects.ReadTreeRecursive(gitDir, baseTree, "")
		if err != nil {
			return nil, err
		}
	}

	// Collect all file paths
	allPaths := make(map[string]bool)
	for path := range oursFiles {
		allPaths[path] = true
	}
	for path := range theirsFiles {
		allPaths[path] = true
	}
	for path := range baseFiles {
		allPaths[path] = true
	}

	// Merge each file
	for path := range allPaths {
		oursSHA := oursFiles[path]
		theirsSHA := theirsFiles[path]
		baseSHA := baseFiles[path]

		content, conflict, err := mergeFile(gitDir, path, oursSHA, theirsSHA, baseSHA)
		if err != nil {
			return nil, err
		}

		if conflict {
			result.Conflicts = append(result.Conflicts, path)
		}

		if content != nil {
			result.MergedFiles[path] = content
		}
	}

	return result, nil
}

func mergeFile(gitDir, path, oursSHA, theirsSHA, baseSHA string) ([]byte, bool, error) {
	// Case: file only in ours
	if theirsSHA == "" && baseSHA == "" {
		_, content, _ := objects.ReadObject(gitDir, oursSHA)
		return content, false, nil
	}

	// Case: file only in theirs
	if oursSHA == "" && baseSHA == "" {
		_, content, _ := objects.ReadObject(gitDir, theirsSHA)
		return content, false, nil
	}

	// Case: file deleted in theirs
	if theirsSHA == "" && oursSHA != "" {
		if oursSHA == baseSHA {
			// They deleted, we didn't change - accept deletion
			return nil, false, nil
		}
		// Conflict: we modified, they deleted
		_, content, _ := objects.ReadObject(gitDir, oursSHA)
		return content, true, nil
	}

	// Case: file deleted in ours
	if oursSHA == "" && theirsSHA != "" {
		if theirsSHA == baseSHA {
			// We deleted, they didn't change - accept deletion
			return nil, false, nil
		}
		// Conflict: we deleted, they modified
		_, content, _ := objects.ReadObject(gitDir, theirsSHA)
		return content, true, nil
	}

	// Both have the file
	if oursSHA == theirsSHA {
		// Same content
		_, content, _ := objects.ReadObject(gitDir, oursSHA)
		return content, false, nil
	}

	if oursSHA == baseSHA {
		// We didn't change, take theirs
		_, content, _ := objects.ReadObject(gitDir, theirsSHA)
		return content, false, nil
	}

	if theirsSHA == baseSHA {
		// They didn't change, keep ours
		_, content, _ := objects.ReadObject(gitDir, oursSHA)
		return content, false, nil
	}

	// Both modified - need to do content merge
	_, oursContent, err := objects.ReadObject(gitDir, oursSHA)
	if err != nil {
		return nil, false, err
	}

	_, theirsContent, err := objects.ReadObject(gitDir, theirsSHA)
	if err != nil {
		return nil, false, err
	}

	var baseContent []byte
	if baseSHA != "" {
		_, baseContent, _ = objects.ReadObject(gitDir, baseSHA)
	}

	// Check if binary
	if diff.IsBinary(oursContent) || diff.IsBinary(theirsContent) {
		// Binary conflict
		return oursContent, true, nil
	}

	// Try text merge
	merged, conflict := mergeText(string(oursContent), string(theirsContent), string(baseContent))
	return []byte(merged), conflict, nil
}

func mergeText(ours, theirs, base string) (string, bool) {
	oursLines := strings.Split(ours, "\n")
	theirsLines := strings.Split(theirs, "\n")
	baseLines := strings.Split(base, "\n")

	// Simple line-by-line merge
	oursEdits := diff.ComputeDiff(base, ours)
	theirsEdits := diff.ComputeDiff(base, theirs)

	// If edits don't overlap, we can merge cleanly
	// For now, use a simplified approach

	// Check if changes are in different parts
	oursChanges := findChangedLines(baseLines, oursLines)
	theirsChanges := findChangedLines(baseLines, theirsLines)

	// Check for overlap
	hasConflict := false
	for line := range oursChanges {
		if theirsChanges[line] {
			hasConflict = true
			break
		}
	}

	if !hasConflict && len(oursEdits) > 0 && len(theirsEdits) > 0 {
		// Apply theirs changes to ours
		return applyNonConflicting(oursLines, theirsLines, baseLines), false
	}

	if hasConflict {
		// Create conflict markers
		return createConflictMarkers(ours, theirs, "HEAD", "theirs"), true
	}

	// No conflicts, return ours (includes any changes we made)
	return ours, false
}

func findChangedLines(base, modified []string) map[int]bool {
	changes := make(map[int]bool)
	edits := diff.ComputeDiff(strings.Join(base, "\n"), strings.Join(modified, "\n"))

	line := 0
	for _, edit := range edits {
		switch edit.Op {
		case diff.OpEqual:
			line++
		case diff.OpDelete:
			changes[line] = true
			line++
		case diff.OpInsert:
			changes[line] = true
		}
	}

	return changes
}

func applyNonConflicting(ours, theirs, base []string) string {
	// Simple approach: if theirs has additions that ours doesn't, include them
	result := make([]string, len(ours))
	copy(result, ours)

	// Find what theirs added that ours doesn't have
	oursSet := make(map[string]bool)
	for _, line := range ours {
		oursSet[line] = true
	}

	baseSet := make(map[string]bool)
	for _, line := range base {
		baseSet[line] = true
	}

	for _, line := range theirs {
		if !oursSet[line] && !baseSet[line] {
			result = append(result, line)
		}
	}

	return strings.Join(result, "\n")
}

func createConflictMarkers(ours, theirs, oursLabel, theirsLabel string) string {
	var sb strings.Builder
	sb.WriteString("<<<<<<< " + oursLabel + "\n")
	sb.WriteString(ours)
	if !strings.HasSuffix(ours, "\n") {
		sb.WriteString("\n")
	}
	sb.WriteString("=======\n")
	sb.WriteString(theirs)
	if !strings.HasSuffix(theirs, "\n") {
		sb.WriteString("\n")
	}
	sb.WriteString(">>>>>>> " + theirsLabel + "\n")
	return sb.String()
}

// CanFastForward checks if we can fast-forward from current to target
func CanFastForward(gitDir, currentSHA, targetSHA string) (bool, error) {
	if currentSHA == "" {
		return true, nil
	}
	return IsAncestor(gitDir, currentSHA, targetSHA)
}

// CheckMergeStatus checks if branches have diverged
func CheckMergeStatus(gitDir, oursBranch, theirsBranch string) (string, error) {
	oursSHA, err := refs.ResolveRef(gitDir, oursBranch)
	if err != nil {
		return "", err
	}

	theirsSHA, err := refs.ResolveRef(gitDir, theirsBranch)
	if err != nil {
		return "", err
	}

	if oursSHA == theirsSHA {
		return "up-to-date", nil
	}

	canFF, err := CanFastForward(gitDir, oursSHA, theirsSHA)
	if err != nil {
		return "", err
	}

	if canFF {
		return "fast-forward", nil
	}

	return "diverged", nil
}
