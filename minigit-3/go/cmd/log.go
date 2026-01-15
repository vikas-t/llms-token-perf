package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"strconv"
	"strings"
	"time"
)

// Log shows commit history
func Log(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	oneline := false
	showAll := false
	showGraph := false
	showStat := false
	maxCount := -1
	var startRef string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--oneline":
			oneline = true
		case "--all":
			showAll = true
		case "--graph":
			showGraph = true
		case "--stat":
			showStat = true
		case "-n":
			if i+1 < len(args) {
				i++
				maxCount, _ = strconv.Atoi(args[i])
			}
		default:
			if strings.HasPrefix(args[i], "-n") {
				maxCount, _ = strconv.Atoi(strings.TrimPrefix(args[i], "-n"))
			} else if !strings.HasPrefix(args[i], "-") {
				startRef = args[i]
			}
		}
	}

	// Get starting commit(s)
	var startSHAs []string

	if showAll {
		// Get all branch heads
		branches, err := refs.ListBranches(repoRoot)
		if err == nil {
			for _, branch := range branches {
				sha, err := refs.ResolveRef(repoRoot, branch)
				if err == nil {
					startSHAs = append(startSHAs, sha)
				}
			}
		}
	} else if startRef != "" {
		sha, err := refs.ResolveRef(repoRoot, startRef)
		if err != nil {
			return fmt.Errorf("unknown revision '%s'", startRef)
		}
		startSHAs = append(startSHAs, sha)
	} else {
		sha, err := refs.ResolveHEAD(repoRoot)
		if err != nil {
			return fmt.Errorf("fatal: your current branch does not have any commits yet")
		}
		startSHAs = append(startSHAs, sha)
	}

	// BFS through commit history
	visited := make(map[string]bool)
	queue := startSHAs
	count := 0

	for len(queue) > 0 && (maxCount < 0 || count < maxCount) {
		// Sort queue by timestamp for proper ordering
		sha := queue[0]
		queue = queue[1:]

		if visited[sha] {
			continue
		}
		visited[sha] = true

		objType, content, err := utils.ReadObject(repoRoot, sha)
		if err != nil {
			continue
		}
		if objType != "commit" {
			continue
		}

		commit, err := objects.ParseCommit(content)
		if err != nil {
			continue
		}

		// Print commit
		if oneline {
			printOnelineCommit(sha, commit, showGraph)
		} else {
			printFullCommit(repoRoot, sha, commit, showStat)
		}

		count++

		// Add parents to queue
		queue = append(queue, commit.Parents...)
	}

	return nil
}

func printOnelineCommit(sha string, commit *objects.Commit, showGraph bool) {
	msg := strings.TrimSpace(commit.Message)
	firstLine := msg
	if idx := strings.Index(msg, "\n"); idx != -1 {
		firstLine = msg[:idx]
	}

	if showGraph {
		fmt.Printf("* %s %s\n", sha[:7], firstLine)
	} else {
		fmt.Printf("%s %s\n", sha[:7], firstLine)
	}
}

func printFullCommit(repoRoot, sha string, commit *objects.Commit, showStat bool) {
	fmt.Printf("commit %s\n", sha)

	if len(commit.Parents) > 1 {
		parentStrs := make([]string, len(commit.Parents))
		for i, p := range commit.Parents {
			parentStrs[i] = p[:7]
		}
		fmt.Printf("Merge: %s\n", strings.Join(parentStrs, " "))
	}

	// Parse author
	authorParts := parseAuthorLine(commit.Author)
	fmt.Printf("Author: %s <%s>\n", authorParts["name"], authorParts["email"])

	// Parse date
	if timestamp, ok := authorParts["timestamp"]; ok {
		if ts, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
			t := time.Unix(ts, 0)
			fmt.Printf("Date:   %s\n", t.Format("Mon Jan 2 15:04:05 2006 -0700"))
		}
	}

	fmt.Println()

	// Print message with indentation
	for _, line := range strings.Split(strings.TrimSpace(commit.Message), "\n") {
		fmt.Printf("    %s\n", line)
	}

	if showStat && len(commit.Parents) > 0 {
		// Show stat compared to first parent
		printCommitStat(repoRoot, commit.Parents[0], sha)
	}

	fmt.Println()
}

func parseAuthorLine(author string) map[string]string {
	result := make(map[string]string)

	// Format: Name <email> timestamp timezone
	emailStart := strings.Index(author, "<")
	emailEnd := strings.Index(author, ">")

	if emailStart > 0 {
		result["name"] = strings.TrimSpace(author[:emailStart])
	}

	if emailStart >= 0 && emailEnd > emailStart {
		result["email"] = author[emailStart+1 : emailEnd]

		// Parse timestamp
		remaining := strings.TrimSpace(author[emailEnd+1:])
		parts := strings.Fields(remaining)
		if len(parts) >= 1 {
			result["timestamp"] = parts[0]
		}
		if len(parts) >= 2 {
			result["timezone"] = parts[1]
		}
	}

	return result
}

func printCommitStat(repoRoot, parentSHA, commitSHA string) {
	// Get trees
	_, parentContent, err := utils.ReadObject(repoRoot, parentSHA)
	if err != nil {
		return
	}
	parentCommit, err := objects.ParseCommit(parentContent)
	if err != nil {
		return
	}

	_, commitContent, err := utils.ReadObject(repoRoot, commitSHA)
	if err != nil {
		return
	}
	commit, err := objects.ParseCommit(commitContent)
	if err != nil {
		return
	}

	parentFiles, _ := flattenTreeToFiles(repoRoot, parentCommit.Tree, "")
	commitFiles, _ := flattenTreeToFiles(repoRoot, commit.Tree, "")

	// Find differences
	fmt.Println()
	for path, sha := range commitFiles {
		if oldSHA, ok := parentFiles[path]; !ok {
			fmt.Printf(" %s | new file\n", path)
		} else if sha != oldSHA {
			fmt.Printf(" %s | modified\n", path)
		}
	}

	for path := range parentFiles {
		if _, ok := commitFiles[path]; !ok {
			fmt.Printf(" %s | deleted\n", path)
		}
	}
}
