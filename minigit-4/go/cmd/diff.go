package cmd

import (
	"fmt"
	"minigit/diff"
	"minigit/index"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
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
	stat := false
	var paths []string
	var commits []string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--cached", "--staged":
			cached = true
		case "--stat":
			stat = true
		case "--":
			// Everything after -- is a path
			paths = append(paths, args[i+1:]...)
			i = len(args)
		default:
			if strings.HasPrefix(args[i], "-") {
				continue
			}
			// Could be a commit or a path
			_, err := refs.ResolveRef(repoRoot, args[i])
			if err == nil {
				commits = append(commits, args[i])
			} else {
				paths = append(paths, args[i])
			}
		}
	}

	idx, err := index.ReadIndex(repoRoot)
	if err != nil {
		return err
	}

	// Different modes
	if len(commits) == 2 {
		// Diff between two commits
		return diffCommits(repoRoot, commits[0], commits[1], paths, stat)
	} else if len(commits) == 1 {
		// Diff working tree against commit
		return diffWorkingAgainstCommit(repoRoot, commits[0], paths, stat)
	} else if cached {
		// Diff index against HEAD
		return diffIndexAgainstHead(repoRoot, idx, paths, stat)
	} else {
		// Diff working tree against index
		return diffWorkingAgainstIndex(repoRoot, idx, paths, stat)
	}
}

func diffWorkingAgainstIndex(repoRoot string, idx *index.Index, paths []string, stat bool) error {
	var allDiffs []string
	var stats []diff.DiffStat

	// Get all index entries
	var files []string
	for name := range idx.Entries {
		if len(paths) == 0 || matchesPath(name, paths) {
			files = append(files, name)
		}
	}
	sort.Strings(files)

	for _, name := range files {
		entry := idx.Entries[name]
		absPath := filepath.Join(repoRoot, name)

		// Read working tree content
		workingContent := ""
		if utils.FileExists(absPath) {
			data, err := utils.ReadFile(absPath)
			if err == nil {
				workingContent = string(data)
			}
		}

		// Read index content
		_, indexData, err := objects.ReadObject(repoRoot, entry.SHA)
		indexContent := ""
		if err == nil {
			indexContent = string(indexData)
		}

		if workingContent == indexContent {
			continue
		}

		// Check for binary
		if isBinary(workingContent) || isBinary(indexContent) {
			if stat {
				stats = append(stats, diff.DiffStat{Path: name})
			} else {
				allDiffs = append(allDiffs, fmt.Sprintf("Binary files a/%s and b/%s differ\n", name, name))
			}
			continue
		}

		d := diff.DiffStrings(indexContent, workingContent, "a/"+name, "b/"+name)
		if d != "" {
			if stat {
				oldLines := strings.Split(indexContent, "\n")
				newLines := strings.Split(workingContent, "\n")
				diffLines := diff.Myers(oldLines, newLines)
				stats = append(stats, diff.GetDiffStats(name, diffLines))
			} else {
				allDiffs = append(allDiffs, d)
			}
		}
	}

	if stat {
		fmt.Print(diff.FormatDiffStat(stats))
	} else {
		for _, d := range allDiffs {
			fmt.Print(d)
		}
	}

	return nil
}

func diffIndexAgainstHead(repoRoot string, idx *index.Index, paths []string, stat bool) error {
	// Get HEAD tree
	headTree := make(map[string]string)
	headSHA, err := refs.ResolveRef(repoRoot, "HEAD")
	if err == nil {
		headTree, _ = getCommitTreeFiles(repoRoot, headSHA)
	}

	var allDiffs []string
	var stats []diff.DiffStat

	// Get all files from both index and HEAD
	allFiles := make(map[string]bool)
	for name := range idx.Entries {
		if len(paths) == 0 || matchesPath(name, paths) {
			allFiles[name] = true
		}
	}
	for name := range headTree {
		if len(paths) == 0 || matchesPath(name, paths) {
			allFiles[name] = true
		}
	}

	var files []string
	for name := range allFiles {
		files = append(files, name)
	}
	sort.Strings(files)

	for _, name := range files {
		indexEntry := idx.Entries[name]
		headSHA := headTree[name]

		// Get contents
		var indexContent, headContent string

		if indexEntry != nil {
			_, data, err := objects.ReadObject(repoRoot, indexEntry.SHA)
			if err == nil {
				indexContent = string(data)
			}
		}

		if headSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, headSHA)
			if err == nil {
				headContent = string(data)
			}
		}

		if indexContent == headContent {
			continue
		}

		// Check for binary
		if isBinary(indexContent) || isBinary(headContent) {
			if stat {
				stats = append(stats, diff.DiffStat{Path: name})
			} else {
				allDiffs = append(allDiffs, fmt.Sprintf("Binary files a/%s and b/%s differ\n", name, name))
			}
			continue
		}

		d := diff.DiffStrings(headContent, indexContent, "a/"+name, "b/"+name)
		if d != "" {
			if stat {
				oldLines := strings.Split(headContent, "\n")
				newLines := strings.Split(indexContent, "\n")
				diffLines := diff.Myers(oldLines, newLines)
				stats = append(stats, diff.GetDiffStats(name, diffLines))
			} else {
				allDiffs = append(allDiffs, d)
			}
		}
	}

	if stat {
		fmt.Print(diff.FormatDiffStat(stats))
	} else {
		for _, d := range allDiffs {
			fmt.Print(d)
		}
	}

	return nil
}

func diffCommits(repoRoot, commit1, commit2 string, paths []string, stat bool) error {
	sha1, err := refs.ResolveRef(repoRoot, commit1)
	if err != nil {
		return err
	}

	sha2, err := refs.ResolveRef(repoRoot, commit2)
	if err != nil {
		return err
	}

	tree1, err := getCommitTreeFiles(repoRoot, sha1)
	if err != nil {
		return err
	}

	tree2, err := getCommitTreeFiles(repoRoot, sha2)
	if err != nil {
		return err
	}

	return diffTrees(repoRoot, tree1, tree2, paths, stat)
}

func diffWorkingAgainstCommit(repoRoot, commitRef string, paths []string, stat bool) error {
	sha, err := refs.ResolveRef(repoRoot, commitRef)
	if err != nil {
		return err
	}

	commitTree, err := getCommitTreeFiles(repoRoot, sha)
	if err != nil {
		return err
	}

	// Build working tree map
	workingTree := make(map[string]string)
	filepath.Walk(repoRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if !strings.HasPrefix(rel, ".minigit") {
			if len(paths) == 0 || matchesPath(rel, paths) {
				data, err := utils.ReadFile(path)
				if err == nil {
					sha, _ := objects.HashObject(repoRoot, objects.BlobType, data, false)
					workingTree[rel] = sha
				}
			}
		}
		return nil
	})

	// Get all files
	allFiles := make(map[string]bool)
	for name := range commitTree {
		if len(paths) == 0 || matchesPath(name, paths) {
			allFiles[name] = true
		}
	}
	for name := range workingTree {
		allFiles[name] = true
	}

	var files []string
	for name := range allFiles {
		files = append(files, name)
	}
	sort.Strings(files)

	var allDiffs []string
	var stats []diff.DiffStat

	for _, name := range files {
		commitSHA := commitTree[name]
		workingSHA := workingTree[name]

		if commitSHA == workingSHA {
			continue
		}

		var commitContent, workingContent string

		if commitSHA != "" {
			_, data, err := objects.ReadObject(repoRoot, commitSHA)
			if err == nil {
				commitContent = string(data)
			}
		}

		if workingSHA != "" {
			absPath := filepath.Join(repoRoot, name)
			data, err := utils.ReadFile(absPath)
			if err == nil {
				workingContent = string(data)
			}
		}

		if isBinary(commitContent) || isBinary(workingContent) {
			if stat {
				stats = append(stats, diff.DiffStat{Path: name})
			} else {
				allDiffs = append(allDiffs, fmt.Sprintf("Binary files a/%s and b/%s differ\n", name, name))
			}
			continue
		}

		d := diff.DiffStrings(commitContent, workingContent, "a/"+name, "b/"+name)
		if d != "" {
			if stat {
				oldLines := strings.Split(commitContent, "\n")
				newLines := strings.Split(workingContent, "\n")
				diffLines := diff.Myers(oldLines, newLines)
				stats = append(stats, diff.GetDiffStats(name, diffLines))
			} else {
				allDiffs = append(allDiffs, d)
			}
		}
	}

	if stat {
		fmt.Print(diff.FormatDiffStat(stats))
	} else {
		for _, d := range allDiffs {
			fmt.Print(d)
		}
	}

	return nil
}

func diffTrees(repoRoot string, tree1, tree2 map[string]string, paths []string, stat bool) error {
	// Get all files
	allFiles := make(map[string]bool)
	for name := range tree1 {
		if len(paths) == 0 || matchesPath(name, paths) {
			allFiles[name] = true
		}
	}
	for name := range tree2 {
		if len(paths) == 0 || matchesPath(name, paths) {
			allFiles[name] = true
		}
	}

	var files []string
	for name := range allFiles {
		files = append(files, name)
	}
	sort.Strings(files)

	var allDiffs []string
	var stats []diff.DiffStat

	for _, name := range files {
		sha1 := tree1[name]
		sha2 := tree2[name]

		if sha1 == sha2 {
			continue
		}

		var content1, content2 string

		if sha1 != "" {
			_, data, err := objects.ReadObject(repoRoot, sha1)
			if err == nil {
				content1 = string(data)
			}
		}

		if sha2 != "" {
			_, data, err := objects.ReadObject(repoRoot, sha2)
			if err == nil {
				content2 = string(data)
			}
		}

		if isBinary(content1) || isBinary(content2) {
			if stat {
				stats = append(stats, diff.DiffStat{Path: name})
			} else {
				allDiffs = append(allDiffs, fmt.Sprintf("Binary files a/%s and b/%s differ\n", name, name))
			}
			continue
		}

		d := diff.DiffStrings(content1, content2, "a/"+name, "b/"+name)
		if d != "" {
			if stat {
				oldLines := strings.Split(content1, "\n")
				newLines := strings.Split(content2, "\n")
				diffLines := diff.Myers(oldLines, newLines)
				stats = append(stats, diff.GetDiffStats(name, diffLines))
			} else {
				allDiffs = append(allDiffs, d)
			}
		}
	}

	if stat {
		fmt.Print(diff.FormatDiffStat(stats))
	} else {
		for _, d := range allDiffs {
			fmt.Print(d)
		}
	}

	return nil
}

func matchesPath(name string, paths []string) bool {
	for _, p := range paths {
		if name == p || strings.HasPrefix(name, p+"/") || strings.HasPrefix(p, name+"/") {
			return true
		}
	}
	return false
}

func isBinary(s string) bool {
	for _, c := range s {
		if c == 0 {
			return true
		}
	}
	return false
}
