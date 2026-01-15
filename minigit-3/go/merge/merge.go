package merge

import (
	"fmt"
	"minigit/objects"
	"minigit/utils"
	"strings"
)

// MergeResult represents the result of a merge operation
type MergeResult struct {
	Merged    bool
	Content   []byte
	HasConflict bool
}

// FindMergeBase finds the common ancestor of two commits
func FindMergeBase(repoRoot, sha1, sha2 string) (string, error) {
	// Get all ancestors of sha1
	ancestors1, err := getAncestors(repoRoot, sha1)
	if err != nil {
		return "", err
	}

	// Find first ancestor of sha2 that's also in sha1's ancestors
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
		objType, content, err := utils.ReadObject(repoRoot, current)
		if err != nil || objType != "commit" {
			continue
		}

		commit, err := objects.ParseCommit(content)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	return "", fmt.Errorf("no common ancestor found")
}

func getAncestors(repoRoot, sha string) (map[string]bool, error) {
	ancestors := make(map[string]bool)
	queue := []string{sha}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if ancestors[current] {
			continue
		}
		ancestors[current] = true

		objType, content, err := utils.ReadObject(repoRoot, current)
		if err != nil || objType != "commit" {
			continue
		}

		commit, err := objects.ParseCommit(content)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	return ancestors, nil
}

// IsAncestor checks if ancestor is an ancestor of descendant
func IsAncestor(repoRoot, ancestor, descendant string) (bool, error) {
	ancestors, err := getAncestors(repoRoot, descendant)
	if err != nil {
		return false, err
	}
	return ancestors[ancestor], nil
}

// ThreeWayMerge performs a three-way merge of file contents
func ThreeWayMerge(base, ours, theirs []byte, oursName, theirsName string) MergeResult {
	// Split into lines
	baseLines := splitLines(base)
	oursLines := splitLines(ours)
	theirsLines := splitLines(theirs)

	// Simple diff3 algorithm
	result, hasConflict := diff3Merge(baseLines, oursLines, theirsLines, oursName, theirsName)

	return MergeResult{
		Merged:      true,
		Content:     []byte(strings.Join(result, "\n")),
		HasConflict: hasConflict,
	}
}

func splitLines(content []byte) []string {
	if len(content) == 0 {
		return []string{}
	}
	s := string(content)
	// Remove trailing newline to avoid empty last element
	s = strings.TrimSuffix(s, "\n")
	if s == "" {
		return []string{}
	}
	return strings.Split(s, "\n")
}

func diff3Merge(base, ours, theirs []string, oursName, theirsName string) ([]string, bool) {
	var result []string
	hasConflict := false

	// LCS-based merge
	oursChanges := computeChanges(base, ours)
	theirsChanges := computeChanges(base, theirs)

	i := 0 // base index
	oursIdx := 0
	theirsIdx := 0

	for i < len(base) || oursIdx < len(ours) || theirsIdx < len(theirs) {
		oursAtEnd := oursIdx >= len(ours)
		theirsAtEnd := theirsIdx >= len(theirs)
		baseAtEnd := i >= len(base)

		if baseAtEnd && oursAtEnd && theirsAtEnd {
			break
		}

		// Check what changed
		oursChanged := oursChanges[i]
		theirsChanged := theirsChanges[i]

		if !oursChanged && !theirsChanged {
			// Both same as base
			if !baseAtEnd {
				if !oursAtEnd && oursIdx < len(ours) {
					result = append(result, ours[oursIdx])
				} else if !theirsAtEnd && theirsIdx < len(theirs) {
					result = append(result, theirs[theirsIdx])
				} else if !baseAtEnd {
					result = append(result, base[i])
				}
			}
			i++
			oursIdx++
			theirsIdx++
		} else if oursChanged && !theirsChanged {
			// Only ours changed
			if !oursAtEnd && (baseAtEnd || oursIdx < len(ours)) {
				// Check if ours deleted or modified
				if oursIdx < len(ours) && (baseAtEnd || base[i] != ours[oursIdx]) {
					result = append(result, ours[oursIdx])
					oursIdx++
				}
			}
			if !theirsAtEnd {
				theirsIdx++
			}
			if !baseAtEnd {
				i++
			}
		} else if !oursChanged && theirsChanged {
			// Only theirs changed
			if !theirsAtEnd && (baseAtEnd || theirsIdx < len(theirs)) {
				if theirsIdx < len(theirs) && (baseAtEnd || base[i] != theirs[theirsIdx]) {
					result = append(result, theirs[theirsIdx])
					theirsIdx++
				}
			}
			if !oursAtEnd {
				oursIdx++
			}
			if !baseAtEnd {
				i++
			}
		} else {
			// Both changed - potential conflict
			oursLine := ""
			theirsLine := ""
			if oursIdx < len(ours) {
				oursLine = ours[oursIdx]
			}
			if theirsIdx < len(theirs) {
				theirsLine = theirs[theirsIdx]
			}

			if oursLine == theirsLine {
				// Same change
				if oursLine != "" {
					result = append(result, oursLine)
				}
			} else {
				// Conflict!
				hasConflict = true
				result = append(result, fmt.Sprintf("<<<<<<< %s", oursName))
				if oursLine != "" {
					result = append(result, oursLine)
				}
				result = append(result, "=======")
				if theirsLine != "" {
					result = append(result, theirsLine)
				}
				result = append(result, fmt.Sprintf(">>>>>>> %s", theirsName))
			}
			if !oursAtEnd {
				oursIdx++
			}
			if !theirsAtEnd {
				theirsIdx++
			}
			if !baseAtEnd {
				i++
			}
		}

		// Safety check for infinite loops
		if i > len(base)*2 && oursIdx > len(ours)*2 && theirsIdx > len(theirs)*2 {
			break
		}
	}

	// Handle trailing lines
	for oursIdx < len(ours) {
		result = append(result, ours[oursIdx])
		oursIdx++
	}
	for theirsIdx < len(theirs) {
		if len(result) == 0 || result[len(result)-1] != theirs[theirsIdx] {
			result = append(result, theirs[theirsIdx])
		}
		theirsIdx++
	}

	return result, hasConflict
}

func computeChanges(base, modified []string) map[int]bool {
	changes := make(map[int]bool)

	// Simple comparison - mark all base lines that are different
	for i := 0; i < len(base); i++ {
		if i >= len(modified) {
			changes[i] = true // deleted
		} else if base[i] != modified[i] {
			changes[i] = true // modified
		}
	}

	return changes
}

// GetTreeDiff returns files that differ between two trees
func GetTreeDiff(repoRoot, tree1, tree2 string) (map[string]string, map[string]string, error) {
	// Returns: (files in tree1 not in tree2 or different, files in tree2 not in tree1 or different)
	entries1, err := flattenTree(repoRoot, tree1, "")
	if err != nil {
		return nil, nil, err
	}

	entries2, err := flattenTree(repoRoot, tree2, "")
	if err != nil {
		return nil, nil, err
	}

	onlyIn1 := make(map[string]string)
	onlyIn2 := make(map[string]string)

	for path, sha := range entries1 {
		if sha2, ok := entries2[path]; !ok || sha2 != sha {
			onlyIn1[path] = sha
		}
	}

	for path, sha := range entries2 {
		if sha1, ok := entries1[path]; !ok || sha1 != sha {
			onlyIn2[path] = sha
		}
	}

	return onlyIn1, onlyIn2, nil
}

func flattenTree(repoRoot, treeSHA, prefix string) (map[string]string, error) {
	result := make(map[string]string)

	if treeSHA == "" {
		return result, nil
	}

	_, content, err := utils.ReadObject(repoRoot, treeSHA)
	if err != nil {
		return nil, err
	}

	entries, err := objects.ParseTree(content)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		path := entry.Name
		if prefix != "" {
			path = prefix + "/" + entry.Name
		}

		if entry.Mode == "40000" {
			// Recurse into subtree
			subEntries, err := flattenTree(repoRoot, entry.SHA, path)
			if err != nil {
				return nil, err
			}
			for k, v := range subEntries {
				result[k] = v
			}
		} else {
			result[path] = entry.SHA
		}
	}

	return result, nil
}
