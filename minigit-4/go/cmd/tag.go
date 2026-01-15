package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"sort"
	"strings"
	"time"
)

// Tag manages tags
func Tag(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	repoRoot, err := utils.FindRepoRoot(cwd)
	if err != nil {
		return err
	}

	// Parse flags
	annotated := false
	deleteFlag := false
	listFlag := false
	var message string
	var tagName string
	var commitRef string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-a":
			annotated = true
		case "-d":
			deleteFlag = true
		case "-l", "--list":
			listFlag = true
		case "-m":
			if i+1 < len(args) {
				message = args[i+1]
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") {
				if tagName == "" {
					tagName = args[i]
				} else if commitRef == "" {
					commitRef = args[i]
				}
			}
		}
	}

	if deleteFlag {
		if tagName == "" {
			return fmt.Errorf("tag name required")
		}
		return deleteTag(repoRoot, tagName)
	}

	if listFlag || tagName == "" {
		return listTags(repoRoot)
	}

	// Create tag
	if commitRef == "" {
		commitRef = "HEAD"
	}

	if annotated || message != "" {
		return createAnnotatedTag(repoRoot, tagName, commitRef, message)
	}

	return createLightweightTag(repoRoot, tagName, commitRef)
}

func listTags(repoRoot string) error {
	tags, err := refs.ListTags(repoRoot)
	if err != nil {
		return err
	}

	sort.Strings(tags)
	for _, tag := range tags {
		fmt.Println(tag)
	}

	return nil
}

func createLightweightTag(repoRoot, name, commitRef string) error {
	// Resolve commit
	sha, err := refs.ResolveRef(repoRoot, commitRef)
	if err != nil {
		return fmt.Errorf("not a valid commit: %s", commitRef)
	}

	// Verify it's a commit
	objType, _, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	if objType != objects.CommitType {
		return fmt.Errorf("not a commit: %s", commitRef)
	}

	return refs.CreateTag(repoRoot, name, sha)
}

func createAnnotatedTag(repoRoot, name, commitRef, message string) error {
	// Resolve commit
	sha, err := refs.ResolveRef(repoRoot, commitRef)
	if err != nil {
		return fmt.Errorf("not a valid commit: %s", commitRef)
	}

	// Verify it's a commit
	objType, _, err := objects.ReadObject(repoRoot, sha)
	if err != nil {
		return err
	}
	if objType != objects.CommitType {
		return fmt.Errorf("not a commit: %s", commitRef)
	}

	// Get tagger info
	taggerName := os.Getenv("GIT_COMMITTER_NAME")
	if taggerName == "" {
		taggerName = os.Getenv("GIT_AUTHOR_NAME")
		if taggerName == "" {
			taggerName = "Unknown"
		}
	}
	taggerEmail := os.Getenv("GIT_COMMITTER_EMAIL")
	if taggerEmail == "" {
		taggerEmail = os.Getenv("GIT_AUTHOR_EMAIL")
		if taggerEmail == "" {
			taggerEmail = "unknown@example.com"
		}
	}

	timestamp := time.Now()
	_, tzOffset := timestamp.Zone()
	tzHours := tzOffset / 3600
	tzMins := (tzOffset % 3600) / 60
	if tzMins < 0 {
		tzMins = -tzMins
	}
	tzStr := fmt.Sprintf("%+03d%02d", tzHours, tzMins)

	tagger := fmt.Sprintf("%s <%s> %d %s", taggerName, taggerEmail, timestamp.Unix(), tzStr)

	// Create tag object
	tag := &objects.Tag{
		Object:  sha,
		ObjType: "commit",
		Name:    name,
		Tagger:  tagger,
		Message: message,
	}

	tagSHA, err := objects.WriteTag(repoRoot, tag)
	if err != nil {
		return err
	}

	// Create tag ref pointing to tag object
	return refs.CreateTag(repoRoot, name, tagSHA)
}

func deleteTag(repoRoot, name string) error {
	return refs.DeleteTag(repoRoot, name)
}
