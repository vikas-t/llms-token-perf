package cmd

import (
	"fmt"
	"minigit/diff"
	"minigit/index"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"strings"
)

// Diff shows changes
func Diff(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	cached := false
	showStat := false
	var filterPaths []string
	var commits []string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--cached", "--staged":
			cached = true
		case "--stat":
			showStat = true
		case "--":
			filterPaths = args[i+1:]
			i = len(args)
		default:
			if !strings.HasPrefix(args[i], "-") {
				// Could be a commit or path
				if _, err := refs.ResolveRef(repoRoot, args[i]); err == nil {
					commits = append(commits, args[i])
				} else {
					filterPaths = append(filterPaths, args[i])
				}
			}
		}
	}

	var diffs []*diff.FileDiff

	if len(commits) == 2 {
		// Diff between two commits
		diffs, err = diffCommits(repoRoot, commits[0], commits[1], filterPaths)
	} else if len(commits) == 1 {
		// Diff working tree against commit
		diffs, err = diffWorkingTreeToCommit(repoRoot, commits[0], filterPaths)
	} else if cached {
		// Diff index against HEAD
		diffs, err = diffIndexToHead(repoRoot, filterPaths)
	} else {
		// Diff working tree against index
		diffs, err = diffWorkingTreeToIndex(repoRoot, filterPaths)
	}

	if err != nil {
		return err
	}

	// Output
	for _, d := range diffs {
		if showStat {
			printDiffStat(d)
		} else {
			fmt.Print(diff.FormatUnifiedDiff(d))
		}
	}

	return nil
}

func diffWorkingTreeToIndex(repoRoot string, filterPaths []string) ([]*diff.FileDiff, error) {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return nil, err
	}

	var diffs []*diff.FileDiff

	for _, entry := range idx.Entries {
		if !shouldIncludePath(entry.Name, filterPaths) {
			continue
		}

		fullPath := filepath.Join(repoRoot, entry.Name)
		workingContent, err := os.ReadFile(fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				// File deleted
				indexContent, _ := getObjectContent(repoRoot, entry.GetSHAHex())
				d := createFileDiff(entry.Name, entry.Name, indexContent, nil, entry.ModeToString(), "")
				if len(d.Hunks) > 0 || d.Binary {
					diffs = append(diffs, d)
				}
			}
			continue
		}

		indexContent, err := getObjectContent(repoRoot, entry.GetSHAHex())
		if err != nil {
			continue
		}

		if string(workingContent) == string(indexContent) {
			continue
		}

		d := createFileDiff(entry.Name, entry.Name, indexContent, workingContent, entry.ModeToString(), entry.ModeToString())
		if len(d.Hunks) > 0 || d.Binary {
			diffs = append(diffs, d)
		}
	}

	return diffs, nil
}

func diffIndexToHead(repoRoot string, filterPaths []string) ([]*diff.FileDiff, error) {
	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return nil, err
	}

	// Get HEAD files
	var headFiles map[string]string
	headSHA, err := refs.ResolveHEAD(repoRoot)
	if err == nil {
		headTree, err := getTreeFromCommit(repoRoot, headSHA)
		if err == nil {
			headFiles, _ = flattenTreeToFiles(repoRoot, headTree, "")
		}
	}
	if headFiles == nil {
		headFiles = make(map[string]string)
	}

	// Get index files
	indexFiles := make(map[string]string)
	for _, entry := range idx.Entries {
		indexFiles[entry.Name] = entry.GetSHAHex()
	}

	var diffs []*diff.FileDiff

	// Files in index
	for _, entry := range idx.Entries {
		if !shouldIncludePath(entry.Name, filterPaths) {
			continue
		}

		indexContent, _ := getObjectContent(repoRoot, entry.GetSHAHex())

		if headSHA, ok := headFiles[entry.Name]; ok {
			if headSHA == entry.GetSHAHex() {
				continue
			}
			headContent, _ := getObjectContent(repoRoot, headSHA)
			d := createFileDiff(entry.Name, entry.Name, headContent, indexContent, "100644", entry.ModeToString())
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		} else {
			// New file
			d := createFileDiff("", entry.Name, nil, indexContent, "", entry.ModeToString())
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		}
	}

	// Deleted files
	for path, sha := range headFiles {
		if !shouldIncludePath(path, filterPaths) {
			continue
		}

		if _, ok := indexFiles[path]; !ok {
			headContent, _ := getObjectContent(repoRoot, sha)
			d := createFileDiff(path, "", headContent, nil, "100644", "")
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		}
	}

	return diffs, nil
}

func diffCommits(repoRoot, commit1, commit2 string, filterPaths []string) ([]*diff.FileDiff, error) {
	sha1, err := refs.ResolveRef(repoRoot, commit1)
	if err != nil {
		return nil, err
	}
	sha2, err := refs.ResolveRef(repoRoot, commit2)
	if err != nil {
		return nil, err
	}

	tree1, err := getTreeFromCommit(repoRoot, sha1)
	if err != nil {
		return nil, err
	}
	tree2, err := getTreeFromCommit(repoRoot, sha2)
	if err != nil {
		return nil, err
	}

	files1, _ := flattenTreeToFiles(repoRoot, tree1, "")
	files2, _ := flattenTreeToFiles(repoRoot, tree2, "")

	var diffs []*diff.FileDiff

	// Files in commit2
	for path, sha := range files2 {
		if !shouldIncludePath(path, filterPaths) {
			continue
		}

		content2, _ := getObjectContent(repoRoot, sha)

		if sha1, ok := files1[path]; ok {
			if sha1 == sha {
				continue
			}
			content1, _ := getObjectContent(repoRoot, sha1)
			d := createFileDiff(path, path, content1, content2, "100644", "100644")
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		} else {
			d := createFileDiff("", path, nil, content2, "", "100644")
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		}
	}

	// Deleted files
	for path, sha := range files1 {
		if !shouldIncludePath(path, filterPaths) {
			continue
		}

		if _, ok := files2[path]; !ok {
			content1, _ := getObjectContent(repoRoot, sha)
			d := createFileDiff(path, "", content1, nil, "100644", "")
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		}
	}

	return diffs, nil
}

func diffWorkingTreeToCommit(repoRoot, commit string, filterPaths []string) ([]*diff.FileDiff, error) {
	sha, err := refs.ResolveRef(repoRoot, commit)
	if err != nil {
		return nil, err
	}

	tree, err := getTreeFromCommit(repoRoot, sha)
	if err != nil {
		return nil, err
	}

	commitFiles, _ := flattenTreeToFiles(repoRoot, tree, "")

	var diffs []*diff.FileDiff

	// Get working tree files
	workingFiles := make(map[string]bool)
	filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}
		relPath, _ := utils.RelativePath(repoRoot, path)
		workingFiles[relPath] = true
		return nil
	})

	// Compare
	for path, sha := range commitFiles {
		if !shouldIncludePath(path, filterPaths) {
			continue
		}

		commitContent, _ := getObjectContent(repoRoot, sha)
		fullPath := filepath.Join(repoRoot, path)

		workingContent, err := os.ReadFile(fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				d := createFileDiff(path, "", commitContent, nil, "100644", "")
				if len(d.Hunks) > 0 || d.Binary {
					diffs = append(diffs, d)
				}
			}
			continue
		}

		if string(workingContent) == string(commitContent) {
			continue
		}

		d := createFileDiff(path, path, commitContent, workingContent, "100644", "100644")
		if len(d.Hunks) > 0 || d.Binary {
			diffs = append(diffs, d)
		}
	}

	// New files in working tree
	for path := range workingFiles {
		if !shouldIncludePath(path, filterPaths) {
			continue
		}

		if _, ok := commitFiles[path]; !ok {
			fullPath := filepath.Join(repoRoot, path)
			content, _ := os.ReadFile(fullPath)
			d := createFileDiff("", path, nil, content, "", "100644")
			if len(d.Hunks) > 0 || d.Binary {
				diffs = append(diffs, d)
			}
		}
	}

	return diffs, nil
}

func createFileDiff(oldPath, newPath string, oldContent, newContent []byte, oldMode, newMode string) *diff.FileDiff {
	d := &diff.FileDiff{
		OldPath: oldPath,
		NewPath: newPath,
		OldMode: oldMode,
		NewMode: newMode,
	}

	if oldPath == "" {
		d.OldPath = newPath
	}
	if newPath == "" {
		d.NewPath = oldPath
	}

	// Check for binary
	if diff.IsBinaryContent(oldContent) || diff.IsBinaryContent(newContent) {
		d.Binary = true
		return d
	}

	oldLines := splitIntoLines(oldContent)
	newLines := splitIntoLines(newContent)

	diffLines := diff.Myers(oldLines, newLines)
	d.Hunks = diff.CreateHunks(diffLines, 3)

	return d
}

func splitIntoLines(content []byte) []string {
	if len(content) == 0 {
		return []string{}
	}
	s := string(content)
	s = strings.TrimSuffix(s, "\n")
	if s == "" {
		return []string{}
	}
	return strings.Split(s, "\n")
}

func getObjectContent(repoRoot, sha string) ([]byte, error) {
	_, content, err := utils.ReadObject(repoRoot, sha)
	return content, err
}

func shouldIncludePath(path string, filterPaths []string) bool {
	if len(filterPaths) == 0 {
		return true
	}

	for _, filter := range filterPaths {
		if path == filter || strings.HasPrefix(path, filter+"/") {
			return true
		}
	}

	return false
}

func printDiffStat(d *diff.FileDiff) {
	if d.Binary {
		fmt.Printf(" %s | Bin\n", d.NewPath)
		return
	}

	additions := 0
	deletions := 0

	for _, hunk := range d.Hunks {
		for _, line := range hunk.Lines {
			switch line.Type {
			case "add":
				additions++
			case "delete":
				deletions++
			}
		}
	}

	path := d.NewPath
	if path == "" {
		path = d.OldPath
	}

	fmt.Printf(" %s | %d ", path, additions+deletions)
	for i := 0; i < additions && i < 50; i++ {
		fmt.Print("+")
	}
	for i := 0; i < deletions && i < 50; i++ {
		fmt.Print("-")
	}
	fmt.Println()
}
