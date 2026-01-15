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
)

// Tag creates, lists, or deletes tags
func Tag(args []string) error {
	gitDir, err := utils.FindGitDir(".")
	if err != nil {
		return err
	}

	// Parse flags
	annotated := false
	deleteFlag := false
	listFlag := false
	var message string
	var names []string

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-a":
			annotated = true
		case "-d":
			deleteFlag = true
		case "-l":
			listFlag = true
		case "-m":
			if i+1 < len(args) {
				message = args[i+1]
				i++
			}
		default:
			if !strings.HasPrefix(args[i], "-") {
				names = append(names, args[i])
			}
		}
	}

	// List tags
	if listFlag || (len(names) == 0 && !deleteFlag) {
		return listTags(gitDir)
	}

	// Delete tag
	if deleteFlag {
		if len(names) == 0 {
			return fmt.Errorf("tag name required")
		}
		return deleteTag(gitDir, names[0])
	}

	// Create tag
	if len(names) == 0 {
		return fmt.Errorf("tag name required")
	}

	name := names[0]
	target := "HEAD"
	if len(names) > 1 {
		target = names[1]
	}

	if annotated || message != "" {
		return createAnnotatedTag(gitDir, name, target, message)
	}

	return createLightweightTag(gitDir, name, target)
}

func listTags(gitDir string) error {
	tags, err := refs.ListTags(gitDir)
	if err != nil {
		return err
	}

	sort.Strings(tags)
	for _, tag := range tags {
		fmt.Println(tag)
	}

	return nil
}

func createLightweightTag(gitDir, name, target string) error {
	if refs.TagExists(gitDir, name) {
		return fmt.Errorf("tag '%s' already exists", name)
	}

	sha, err := refs.ResolveRef(gitDir, target)
	if err != nil {
		return err
	}

	tagPath := filepath.Join(gitDir, "refs", "tags", name)
	if err := os.MkdirAll(filepath.Dir(tagPath), 0755); err != nil {
		return err
	}

	return os.WriteFile(tagPath, []byte(sha+"\n"), 0644)
}

func createAnnotatedTag(gitDir, name, target, message string) error {
	if refs.TagExists(gitDir, name) {
		return fmt.Errorf("tag '%s' already exists", name)
	}

	sha, err := refs.ResolveRef(gitDir, target)
	if err != nil {
		return err
	}

	// Get object type
	objType, _, err := objects.ReadObject(gitDir, sha)
	if err != nil {
		return err
	}

	tagger := objects.GetAuthorString("GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE")

	tagData := objects.BuildTag(sha, objType, name, tagger, message)
	tagSHA, err := objects.WriteObject(gitDir, objects.TypeTag, tagData)
	if err != nil {
		return err
	}

	tagPath := filepath.Join(gitDir, "refs", "tags", name)
	if err := os.MkdirAll(filepath.Dir(tagPath), 0755); err != nil {
		return err
	}

	return os.WriteFile(tagPath, []byte(tagSHA+"\n"), 0644)
}

func deleteTag(gitDir, name string) error {
	if !refs.TagExists(gitDir, name) {
		return fmt.Errorf("tag '%s' not found", name)
	}

	tagPath := filepath.Join(gitDir, "refs", "tags", name)
	if err := os.Remove(tagPath); err != nil {
		return err
	}

	fmt.Printf("Deleted tag '%s'\n", name)
	return nil
}
