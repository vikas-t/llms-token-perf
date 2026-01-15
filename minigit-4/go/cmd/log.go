package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"sort"
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
	graph := false
	showStat := false
	limit := -1
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
			showStat = true
		case "-n":
			if i+1 < len(args) {
				n, err := strconv.Atoi(args[i+1])
				if err == nil {
					limit = n
				}
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") && startRef == "" {
				startRef = args[i]
			}
		}
	}

	var startSHAs []string

	if showAll {
		// Get all branches
		branches, err := refs.ListBranches(repoRoot)
		if err != nil {
			return err
		}
		for _, branch := range branches {
			sha, err := refs.ResolveRef(repoRoot, branch)
			if err == nil {
				startSHAs = append(startSHAs, sha)
			}
		}
	} else {
		if startRef == "" {
			startRef = "HEAD"
		}
		sha, err := refs.ResolveRef(repoRoot, startRef)
		if err != nil {
			return err
		}
		startSHAs = append(startSHAs, sha)
	}

	if len(startSHAs) == 0 {
		return fmt.Errorf("no commits found")
	}

	// Walk commits
	visited := make(map[string]bool)
	var commits []commitInfo
	toVisit := startSHAs

	for len(toVisit) > 0 {
		sha := toVisit[0]
		toVisit = toVisit[1:]

		if visited[sha] {
			continue
		}
		visited[sha] = true

		objType, data, err := objects.ReadObject(repoRoot, sha)
		if err != nil || objType != objects.CommitType {
			continue
		}

		commit, err := objects.ParseCommit(data)
		if err != nil {
			continue
		}

		commits = append(commits, commitInfo{
			SHA:     sha,
			Commit:  commit,
			RawData: data,
		})

		toVisit = append(toVisit, commit.Parents...)
	}

	// Sort commits by timestamp (newest first)
	sort.Slice(commits, func(i, j int) bool {
		return getCommitTime(commits[i].Commit) > getCommitTime(commits[j].Commit)
	})

	// Apply limit
	if limit > 0 && len(commits) > limit {
		commits = commits[:limit]
	}

	// Print commits
	for i, ci := range commits {
		if oneline {
			printOnelineCommit(ci.SHA, ci.Commit, graph)
		} else {
			printFullCommit(repoRoot, ci.SHA, ci.Commit, showStat, i > 0)
		}
	}

	return nil
}

type commitInfo struct {
	SHA     string
	Commit  *objects.Commit
	RawData []byte
}

func getCommitTime(commit *objects.Commit) int64 {
	// Parse timestamp from author line
	// Format: Name <email> timestamp timezone
	parts := strings.Fields(commit.Author)
	if len(parts) >= 3 {
		// Second to last part is timestamp
		ts, err := strconv.ParseInt(parts[len(parts)-2], 10, 64)
		if err == nil {
			return ts
		}
	}
	return 0
}

func printOnelineCommit(sha string, commit *objects.Commit, graph bool) {
	message := strings.SplitN(commit.Message, "\n", 2)[0]
	if graph {
		fmt.Printf("* %s %s\n", sha[:7], message)
	} else {
		fmt.Printf("%s %s\n", sha[:7], message)
	}
}

func printFullCommit(repoRoot string, sha string, commit *objects.Commit, showStat bool, separator bool) {
	if separator {
		fmt.Println()
	}

	fmt.Printf("commit %s\n", sha)

	// Check for merge commit
	if len(commit.Parents) > 1 {
		var parentShorts []string
		for _, p := range commit.Parents {
			parentShorts = append(parentShorts, p[:7])
		}
		fmt.Printf("Merge: %s\n", strings.Join(parentShorts, " "))
	}

	// Parse author
	author := commit.Author
	name, email, ts := parseAuthorLine(author)
	fmt.Printf("Author: %s <%s>\n", name, email)

	// Format date
	if ts > 0 {
		t := time.Unix(ts, 0)
		fmt.Printf("Date:   %s\n", t.Format("Mon Jan 2 15:04:05 2006 -0700"))
	}

	// Message
	fmt.Println()
	for _, line := range strings.Split(commit.Message, "\n") {
		fmt.Printf("    %s\n", line)
	}

	if showStat {
		printCommitStat(repoRoot, sha, commit)
	}
}

func parseAuthorLine(author string) (name, email string, timestamp int64) {
	// Format: Name <email> timestamp timezone
	ltIdx := strings.Index(author, "<")
	gtIdx := strings.Index(author, ">")

	if ltIdx > 0 && gtIdx > ltIdx {
		name = strings.TrimSpace(author[:ltIdx])
		email = author[ltIdx+1 : gtIdx]

		rest := strings.TrimSpace(author[gtIdx+1:])
		parts := strings.Fields(rest)
		if len(parts) >= 1 {
			timestamp, _ = strconv.ParseInt(parts[0], 10, 64)
		}
	}

	return
}

func printCommitStat(repoRoot, sha string, commit *objects.Commit) {
	// Get tree files
	currentTree, err := getCommitTreeFiles(repoRoot, sha)
	if err != nil {
		return
	}

	// Get parent tree files
	parentTree := make(map[string]string)
	if len(commit.Parents) > 0 {
		parentTree, _ = getCommitTreeFiles(repoRoot, commit.Parents[0])
	}

	// Find changed files
	var changed []string
	allFiles := make(map[string]bool)
	for f := range currentTree {
		allFiles[f] = true
	}
	for f := range parentTree {
		allFiles[f] = true
	}

	for f := range allFiles {
		currentSHA := currentTree[f]
		parentSHA := parentTree[f]
		if currentSHA != parentSHA {
			changed = append(changed, f)
		}
	}

	sort.Strings(changed)

	fmt.Println()
	for _, f := range changed {
		fmt.Printf(" %s\n", f)
	}
	fmt.Printf(" %d file(s) changed\n", len(changed))
}

func getCommitTreeFiles(repoRoot, commitSHA string) (map[string]string, error) {
	files := make(map[string]string)

	objType, data, err := objects.ReadObject(repoRoot, commitSHA)
	if err != nil {
		return files, err
	}

	if objType != objects.CommitType {
		return files, fmt.Errorf("not a commit")
	}

	commit, err := objects.ParseCommit(data)
	if err != nil {
		return files, err
	}

	return walkTree(repoRoot, commit.Tree, "")
}
