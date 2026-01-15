package main

import (
	"diffmerge/dm"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func main() {
	if len(os.Args) < 2 { fmt.Fprintln(os.Stderr, "Usage: diffmerge <command>"); os.Exit(1) }
	input, _ := io.ReadAll(os.Stdin)
	var args []json.RawMessage
	json.Unmarshal(input, &args)
	var result interface{}
	var err error
	s := func(i int) (r string) { json.Unmarshal(args[i], &r); return }
	n := func(i int) (r int) { json.Unmarshal(args[i], &r); return }
	switch os.Args[1] {
	case "diff_lines":
		var o dm.DiffOptions; if len(args)>2 { json.Unmarshal(args[2], &o) }; result = dm.DiffLines(s(0), s(1), o)
	case "diff_words": result = dm.DiffWords(s(0), s(1))
	case "diff_chars": result = dm.DiffChars(s(0), s(1))
	case "create_patch":
		var o dm.PatchOptions; if len(args)>2 { json.Unmarshal(args[2], &o) }; result = dm.CreatePatch(s(0), s(1), o)
	case "apply_patch": result = dm.ApplyPatch(s(0), s(1))
	case "reverse_patch": result = dm.ReversePatch(s(0))
	case "parse_patch": result, err = dm.ParsePatch(s(0))
	case "merge3":
		var o dm.MergeOptions; if len(args)>3 { json.Unmarshal(args[3], &o) }; result = dm.Merge3(s(0), s(1), s(2), o)
	case "has_conflicts": result = dm.HasConflicts(s(0))
	case "extract_conflicts": result = dm.ExtractConflicts(s(0))
	case "resolve_conflict": result = dm.ResolveConflict(s(0), n(1), s(2))
	case "is_binary": result = dm.IsBinary(s(0))
	case "normalize_line_endings": result = dm.NormalizeLineEndings(s(0))
	default: fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1]); os.Exit(1)
	}
	if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
	json.NewEncoder(os.Stdout).Encode(result)
}
