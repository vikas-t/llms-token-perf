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
	"strings"
)

// Diff shows changes
func Diff(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}
	workTree := utils.GetWorkTree(gitDir)

	// Parse flags
	staged := false
	showStat := false
	var commits []string
	var paths []string
	inPaths := false

	for _, arg := range args {
		if arg == "--" {
			inPaths = true
			continue
		}
		if inPaths {
			paths = append(paths, arg)
			continue
		}
		switch arg {
		case "--staged", "--cached":
			staged = true
		case "--stat":
			showStat = true
		default:
			if !strings.HasPrefix(arg, "-") {
				commits = append(commits, arg)
			}
		}
	}

	if len(commits) == 2 {
		// Diff between two commits
		return diffCommits(gitDir, workTree, commits[0], commits[1], paths, showStat)
	}

	if len(commits) == 1 {
		// Diff commit with working tree
		return diffCommitWithWorkTree(gitDir, workTree, commits[0], paths, showStat)
	}

	if staged {
		// Diff index with HEAD
		return diffIndexWithHead(gitDir, paths, showStat)
	}

	// Diff working tree with index
	return diffWorkTreeWithIndex(gitDir, workTree, paths, showStat)
}

func diffWorkTreeWithIndex(gitDir, workTree string, paths []string, showStat bool) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	var output strings.Builder

	for _, entry := range idx.Entries {
		if len(paths) > 0 && !matchPath(entry.Name, paths) {
			continue
		}

		fullPath := filepath.Join(workTree, entry.Name)
		workContent, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		_, indexContent, err := objects.ReadObject(gitDir, entry.SHA)
		if err != nil {
			continue
		}

		if string(workContent) == string(indexContent) {
			continue
		}

		result := diff.DiffFiles(entry.Name, entry.Name, indexContent, workContent)
		if showStat {
			printDiffStat(entry.Name, result, &output)
		} else {
			output.WriteString(diff.FormatUnifiedDiff(result))
		}
	}

	fmt.Print(output.String())
	return nil
}

func diffIndexWithHead(gitDir string, paths []string, showStat bool) error {
	idx, err := index.ReadIndex(gitDir)
	if err != nil {
		return err
	}

	// Get HEAD tree
	headFiles := make(map[string]string)
	headSHA, err := refs.ResolveRef(gitDir, "HEAD")
	if err == nil && headSHA != "" {
		treeSHA, err := objects.GetTreeSHAFromCommit(gitDir, headSHA)
		if err == nil {
			headFiles, _ = objects.ReadTreeRecursive(gitDir, treeSHA, "")
		}
	}

	indexFiles := make(map[string]string)
	for _, entry := range idx.Entries {
		indexFiles[entry.Name] = entry.SHA
	}

	var output strings.Builder

	// All files in either HEAD or index
	allFiles := make(map[string]bool)
	for path := range headFiles {
		allFiles[path] = true
	}
	for path := range indexFiles {
		allFiles[path] = true
	}

	for path := range allFiles {
		if len(paths) > 0 && !matchPath(path, paths) {
			continue
		}

		headSHA := headFiles[path]
		indexSHA := indexFiles[path]

		if headSHA == indexSHA {
			continue
		}

		var oldContent, newContent []byte

		if headSHA != "" {
			_, oldContent, _ = objects.ReadObject(gitDir, headSHA)
		}
		if indexSHA != "" {
			_, newContent, _ = objects.ReadObject(gitDir, indexSHA)
		}

		oldPath := path
		newPath := path
		if headSHA == "" {
			oldPath = "/dev/null"
		}
		if indexSHA == "" {
			newPath = "/dev/null"
		}

		result := diff.DiffFiles(oldPath, newPath, oldContent, newContent)
		if showStat {
			printDiffStat(path, result, &output)
		} else {
			output.WriteString(diff.FormatUnifiedDiff(result))
		}
	}

	fmt.Print(output.String())
	return nil
}

func diffCommits(gitDir, workTree, commit1, commit2 string, paths []string, showStat bool) error {
	sha1, err := refs.ResolveRef(gitDir, commit1)
	if err != nil {
		return err
	}

	sha2, err := refs.ResolveRef(gitDir, commit2)
	if err != nil {
		return err
	}

	tree1, err := objects.GetTreeSHAFromCommit(gitDir, sha1)
	if err != nil {
		return err
	}

	tree2, err := objects.GetTreeSHAFromCommit(gitDir, sha2)
	if err != nil {
		return err
	}

	files1, _ := objects.ReadTreeRecursive(gitDir, tree1, "")
	files2, _ := objects.ReadTreeRecursive(gitDir, tree2, "")

	return diffTrees(gitDir, files1, files2, paths, showStat)
}

func diffCommitWithWorkTree(gitDir, workTree, commit string, paths []string, showStat bool) error {
	sha, err := refs.ResolveRef(gitDir, commit)
	if err != nil {
		return err
	}

	tree, err := objects.GetTreeSHAFromCommit(gitDir, sha)
	if err != nil {
		return err
	}

	commitFiles, _ := objects.ReadTreeRecursive(gitDir, tree, "")

	// Get working tree files
	workFiles := make(map[string][]byte)
	filepath.Walk(workTree, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.Name() == ".minigit" {
				return filepath.SkipDir
			}
			return nil
		}
		relPath, _ := filepath.Rel(workTree, path)
		relPath = utils.NormalizePath(relPath)
		if !strings.HasPrefix(relPath, ".") {
			content, _ := os.ReadFile(path)
			workFiles[relPath] = content
		}
		return nil
	})

	var output strings.Builder

	allFiles := make(map[string]bool)
	for path := range commitFiles {
		allFiles[path] = true
	}
	for path := range workFiles {
		allFiles[path] = true
	}

	for path := range allFiles {
		if len(paths) > 0 && !matchPath(path, paths) {
			continue
		}

		var oldContent, newContent []byte

		if sha := commitFiles[path]; sha != "" {
			_, oldContent, _ = objects.ReadObject(gitDir, sha)
		}
		if content, ok := workFiles[path]; ok {
			newContent = content
		}

		if string(oldContent) == string(newContent) {
			continue
		}

		result := diff.DiffFiles(path, path, oldContent, newContent)
		if showStat {
			printDiffStat(path, result, &output)
		} else {
			output.WriteString(diff.FormatUnifiedDiff(result))
		}
	}

	fmt.Print(output.String())
	return nil
}

func diffTrees(gitDir string, files1, files2 map[string]string, paths []string, showStat bool) error {
	allFiles := make(map[string]bool)
	for path := range files1 {
		allFiles[path] = true
	}
	for path := range files2 {
		allFiles[path] = true
	}

	var output strings.Builder

	for path := range allFiles {
		if len(paths) > 0 && !matchPath(path, paths) {
			continue
		}

		sha1 := files1[path]
		sha2 := files2[path]

		if sha1 == sha2 {
			continue
		}

		var oldContent, newContent []byte

		if sha1 != "" {
			_, oldContent, _ = objects.ReadObject(gitDir, sha1)
		}
		if sha2 != "" {
			_, newContent, _ = objects.ReadObject(gitDir, sha2)
		}

		result := diff.DiffFiles(path, path, oldContent, newContent)
		if showStat {
			printDiffStat(path, result, &output)
		} else {
			output.WriteString(diff.FormatUnifiedDiff(result))
		}
	}

	fmt.Print(output.String())
	return nil
}

func matchPath(path string, patterns []string) bool {
	for _, pattern := range patterns {
		if strings.HasPrefix(path, pattern) || path == pattern {
			return true
		}
	}
	return false
}

func printDiffStat(path string, result *diff.DiffResult, output *strings.Builder) {
	if result.Binary {
		output.WriteString(fmt.Sprintf(" %s | Bin\n", path))
		return
	}

	insertions := 0
	deletions := 0

	for _, hunk := range result.Hunks {
		for _, edit := range hunk.Lines {
			switch edit.Op {
			case diff.OpInsert:
				insertions++
			case diff.OpDelete:
				deletions++
			}
		}
	}

	if insertions > 0 || deletions > 0 {
		total := insertions + deletions
		output.WriteString(fmt.Sprintf(" %s | %d ", path, total))
		for i := 0; i < insertions && i < 10; i++ {
			output.WriteString("+")
		}
		for i := 0; i < deletions && i < 10; i++ {
			output.WriteString("-")
		}
		output.WriteString("\n")
	}
}
