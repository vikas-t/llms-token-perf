package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"strconv"
	"strings"
	"time"
)

// Log shows commit history
func Log(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	// Parse flags
	oneline := false
	showAll := false
	graph := false
	stat := false
	maxCount := -1
	var startRef string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--oneline":
			oneline = true
		case "--all":
			showAll = true
		case "--graph":
			graph = true
		case "--stat":
			stat = true
		case "-n":
			if i+1 < len(args) {
				maxCount, _ = strconv.Atoi(args[i+1])
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") {
				startRef = args[i]
			}
		}
	}

	var startSHAs []string

	if showAll {
		// Get all branch heads
		branches, err := refs.ListBranches(gitDir)
		if err != nil {
			return err
		}
		for _, branch := range branches {
			sha, err := refs.ResolveRef(gitDir, "refs/heads/"+branch)
			if err == nil {
				startSHAs = append(startSHAs, sha)
			}
		}
	} else {
		if startRef == "" {
			startRef = "HEAD"
		}
		sha, err := refs.ResolveRef(gitDir, startRef)
		if err != nil {
			return err
		}
		startSHAs = []string{sha}
	}

	if len(startSHAs) == 0 {
		return fmt.Errorf("no commits")
	}

	// Traverse commits
	visited := make(map[string]bool)
	var commits []string
	queue := startSHAs

	for len(queue) > 0 && (maxCount < 0 || len(commits) < maxCount) {
		sha := queue[0]
		queue = queue[1:]

		if visited[sha] {
			continue
		}
		visited[sha] = true
		commits = append(commits, sha)

		objType, data, err := objects.ReadObject(gitDir, sha)
		if err != nil || objType != objects.TypeCommit {
			continue
		}

		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}

		queue = append(queue, commit.Parents...)
	}

	// Print commits
	for i, sha := range commits {
		if maxCount >= 0 && i >= maxCount {
			break
		}

		objType, data, err := objects.ReadObject(gitDir, sha)
		if err != nil || objType != objects.TypeCommit {
			continue
		}

		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}

		if oneline {
			if graph {
				fmt.Print("* ")
			}
			firstLine := strings.Split(strings.TrimSpace(commit.Message), "\n")[0]
			fmt.Printf("%s %s\n", sha[:7], firstLine)
		} else {
			if graph {
				fmt.Print("* ")
			}
			fmt.Printf("commit %s\n", sha)
			if len(commit.Parents) > 1 {
				fmt.Printf("Merge: %s %s\n", commit.Parents[0][:7], commit.Parents[1][:7])
			}
			fmt.Printf("Author: %s\n", formatAuthor(commit.Author))
			fmt.Printf("Date:   %s\n", formatDate(commit.Author))
			fmt.Println()
			for _, line := range strings.Split(commit.Message, "\n") {
				fmt.Printf("    %s\n", line)
			}
			fmt.Println()

			if stat && len(commit.Parents) > 0 {
				printStat(gitDir, commit.Parents[0], sha)
			}
		}
	}

	return nil
}

func formatAuthor(author string) string {
	// Format: "Name <email> timestamp tz"
	parts := strings.Split(author, " ")
	if len(parts) < 2 {
		return author
	}

	// Find email
	emailStart := strings.Index(author, "<")
	emailEnd := strings.Index(author, ">")
	if emailStart < 0 || emailEnd < 0 {
		return author
	}

	return author[:emailEnd+1]
}

func formatDate(author string) string {
	// Parse timestamp from author string
	parts := strings.Split(author, " ")
	if len(parts) < 3 {
		return ""
	}

	// Find timestamp (second to last element)
	timestampIdx := -1
	for i := len(parts) - 2; i >= 0; i-- {
		if _, err := strconv.ParseInt(parts[i], 10, 64); err == nil {
			timestampIdx = i
			break
		}
	}

	if timestampIdx < 0 {
		return ""
	}

	timestamp, _ := strconv.ParseInt(parts[timestampIdx], 10, 64)
	t := time.Unix(timestamp, 0).UTC()

	tz := "+0000"
	if timestampIdx+1 < len(parts) {
		tz = parts[timestampIdx+1]
	}

	return t.Format("Mon Jan 2 15:04:05 2006") + " " + tz
}

func printStat(gitDir, parentSHA, commitSHA string) {
	parentTree, err := objects.GetTreeSHAFromCommit(gitDir, parentSHA)
	if err != nil {
		return
	}

	commitTree, err := objects.GetTreeSHAFromCommit(gitDir, commitSHA)
	if err != nil {
		return
	}

	parentFiles, _ := objects.ReadTreeRecursive(gitDir, parentTree, "")
	commitFiles, _ := objects.ReadTreeRecursive(gitDir, commitTree, "")

	// Find changed files
	var changed []string
	allFiles := make(map[string]bool)
	for path := range parentFiles {
		allFiles[path] = true
	}
	for path := range commitFiles {
		allFiles[path] = true
	}

	for path := range allFiles {
		oldSHA := parentFiles[path]
		newSHA := commitFiles[path]
		if oldSHA != newSHA {
			changed = append(changed, path)
		}
	}

	for _, path := range changed {
		fmt.Printf(" %s | changes\n", path)
	}

	if len(changed) > 0 {
		fmt.Println()
	}
}
