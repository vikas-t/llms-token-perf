package cmd

import (
	"fmt"
	"minigit/objects"
	"minigit/refs"
	"minigit/utils"
	"os"
	"path/filepath"
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
	var positionalArgs []string

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
				i++
				message = args[i]
			}
		default:
			if strings.HasPrefix(args[i], "-m") {
				message = strings.TrimPrefix(args[i], "-m")
			} else if !strings.HasPrefix(args[i], "-") {
				positionalArgs = append(positionalArgs, args[i])
			}
		}
	}

	// If -m is provided, assume annotated
	if message != "" {
		annotated = true
	}

	// Delete tag
	if deleteFlag {
		if len(positionalArgs) == 0 {
			return fmt.Errorf("tag name required")
		}
		return deleteTag(repoRoot, positionalArgs[0])
	}

	// List tags
	if listFlag || len(positionalArgs) == 0 {
		return listTags(repoRoot)
	}

	// Create tag
	tagName := positionalArgs[0]
	var targetRef string
	if len(positionalArgs) > 1 {
		targetRef = positionalArgs[1]
	}

	if annotated {
		return createAnnotatedTag(repoRoot, tagName, targetRef, message)
	}

	return createLightweightTag(repoRoot, tagName, targetRef)
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

func createLightweightTag(repoRoot, name, targetRef string) error {
	// Validate tag name
	if err := validateTagName(name); err != nil {
		return err
	}

	// Check if tag already exists
	tagPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "tags", name)
	if _, err := os.Stat(tagPath); err == nil {
		return fmt.Errorf("tag '%s' already exists", name)
	}

	// Get target commit
	var targetSHA string
	var err error

	if targetRef != "" {
		targetSHA, err = refs.ResolveRef(repoRoot, targetRef)
		if err != nil {
			return fmt.Errorf("not a valid object name: '%s'", targetRef)
		}
	} else {
		targetSHA, err = refs.ResolveHEAD(repoRoot)
		if err != nil {
			return fmt.Errorf("cannot create tag: no commits yet")
		}
	}

	// Create tag ref
	return refs.UpdateRef(repoRoot, "refs/tags/"+name, targetSHA)
}

func createAnnotatedTag(repoRoot, name, targetRef, message string) error {
	// Validate tag name
	if err := validateTagName(name); err != nil {
		return err
	}

	// Check if tag already exists
	tagPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "tags", name)
	if _, err := os.Stat(tagPath); err == nil {
		return fmt.Errorf("tag '%s' already exists", name)
	}

	// Get target commit
	var targetSHA string
	var err error

	if targetRef != "" {
		targetSHA, err = refs.ResolveRef(repoRoot, targetRef)
		if err != nil {
			return fmt.Errorf("not a valid object name: '%s'", targetRef)
		}
	} else {
		targetSHA, err = refs.ResolveHEAD(repoRoot)
		if err != nil {
			return fmt.Errorf("cannot create tag: no commits yet")
		}
	}

	// Get tagger info
	taggerName := utils.GetEnvOrDefault("GIT_COMMITTER_NAME", "Unknown")
	taggerEmail := utils.GetEnvOrDefault("GIT_COMMITTER_EMAIL", "unknown@example.com")
	taggerDate := parseTagDate(os.Getenv("GIT_COMMITTER_DATE"))

	tagger := objects.FormatAuthor(taggerName, taggerEmail, taggerDate)

	if message == "" {
		message = name
	}

	// Create tag object
	tagSHA, err := objects.CreateTag(repoRoot, targetSHA, "commit", name, tagger, message)
	if err != nil {
		return err
	}

	// Create tag ref pointing to tag object
	return refs.UpdateRef(repoRoot, "refs/tags/"+name, tagSHA)
}

func deleteTag(repoRoot, name string) error {
	tagPath := filepath.Join(utils.MinigitPath(repoRoot), "refs", "tags", name)
	if _, err := os.Stat(tagPath); os.IsNotExist(err) {
		return fmt.Errorf("tag '%s' not found", name)
	}

	if err := os.Remove(tagPath); err != nil {
		return err
	}

	fmt.Printf("Deleted tag '%s'\n", name)
	return nil
}

func validateTagName(name string) error {
	if name == "" {
		return fmt.Errorf("tag name cannot be empty")
	}

	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("tag name cannot start with '-'")
	}

	if strings.Contains(name, "..") {
		return fmt.Errorf("tag name cannot contain '..'")
	}

	if strings.Contains(name, " ") {
		return fmt.Errorf("tag name cannot contain spaces")
	}

	return nil
}

func parseTagDate(dateStr string) time.Time {
	if dateStr == "" {
		return time.Now()
	}

	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05Z",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t
		}
	}

	return time.Now()
}
