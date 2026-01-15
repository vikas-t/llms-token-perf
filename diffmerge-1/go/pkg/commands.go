package pkg

import (
	"encoding/json"
	"fmt"
)

// HandleCommand handles CLI commands and returns the result
func HandleCommand(cmd string, args []json.RawMessage) (interface{}, error) {
	switch cmd {
	case "diff_lines":
		var old, new string
		var opts DiffOptions
		json.Unmarshal(args[0], &old)
		json.Unmarshal(args[1], &new)
		if len(args) > 2 {
			json.Unmarshal(args[2], &opts)
		}
		return DiffLines(old, new, opts), nil
	case "diff_words":
		var old, new string
		json.Unmarshal(args[0], &old)
		json.Unmarshal(args[1], &new)
		return DiffWords(old, new), nil
	case "diff_chars":
		var old, new string
		json.Unmarshal(args[0], &old)
		json.Unmarshal(args[1], &new)
		return DiffChars(old, new), nil
	case "create_patch":
		var old, new string
		var opts PatchOptions
		json.Unmarshal(args[0], &old)
		json.Unmarshal(args[1], &new)
		if len(args) > 2 {
			json.Unmarshal(args[2], &opts)
		}
		return CreatePatch(old, new, opts), nil
	case "apply_patch":
		var content, patch string
		json.Unmarshal(args[0], &content)
		json.Unmarshal(args[1], &patch)
		return ApplyPatch(content, patch), nil
	case "reverse_patch":
		var patch string
		json.Unmarshal(args[0], &patch)
		return ReversePatch(patch), nil
	case "parse_patch":
		var patch string
		json.Unmarshal(args[0], &patch)
		return ParsePatch(patch)
	case "merge3":
		var base, ours, theirs string
		var opts MergeOptions
		json.Unmarshal(args[0], &base)
		json.Unmarshal(args[1], &ours)
		json.Unmarshal(args[2], &theirs)
		if len(args) > 3 {
			json.Unmarshal(args[3], &opts)
		}
		return Merge3(base, ours, theirs, opts), nil
	case "has_conflicts":
		var content string
		json.Unmarshal(args[0], &content)
		return HasConflicts(content), nil
	case "extract_conflicts":
		var content string
		json.Unmarshal(args[0], &content)
		return ExtractConflicts(content), nil
	case "resolve_conflict":
		var content string
		var index int
		var resolution string
		json.Unmarshal(args[0], &content)
		json.Unmarshal(args[1], &index)
		json.Unmarshal(args[2], &resolution)
		return ResolveConflict(content, index, resolution), nil
	case "is_binary":
		var content string
		json.Unmarshal(args[0], &content)
		return IsBinary(content), nil
	case "normalize_line_endings":
		var content string
		json.Unmarshal(args[0], &content)
		return NormalizeLineEndings(content), nil
	default:
		return nil, fmt.Errorf("unknown command: %s", cmd)
	}
}
