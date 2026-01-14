package main

import ("diffmerge/dm"; "encoding/json"; "fmt"; "io"; "os")

func main() {
	if len(os.Args) < 2 { fmt.Fprintln(os.Stderr, "Usage: diffmerge <command>"); os.Exit(1) }
	input, _ := io.ReadAll(os.Stdin)
	var args []json.RawMessage; json.Unmarshal(input, &args)
	var result interface{}; var err error
	switch os.Args[1] {
	case "diff_lines":
		var old, new string; var opts dm.DiffOptions
		json.Unmarshal(args[0], &old); json.Unmarshal(args[1], &new); if len(args) > 2 { json.Unmarshal(args[2], &opts) }
		result = dm.DiffLines(old, new, opts)
	case "diff_words":
		var old, new string; json.Unmarshal(args[0], &old); json.Unmarshal(args[1], &new); result = dm.DiffWords(old, new)
	case "diff_chars":
		var old, new string; json.Unmarshal(args[0], &old); json.Unmarshal(args[1], &new); result = dm.DiffChars(old, new)
	case "create_patch":
		var old, new string; var opts dm.PatchOptions
		json.Unmarshal(args[0], &old); json.Unmarshal(args[1], &new); if len(args) > 2 { json.Unmarshal(args[2], &opts) }
		result = dm.CreatePatch(old, new, opts)
	case "apply_patch":
		var c, p string; json.Unmarshal(args[0], &c); json.Unmarshal(args[1], &p); result = dm.ApplyPatch(c, p)
	case "reverse_patch":
		var p string; json.Unmarshal(args[0], &p); result = dm.ReversePatch(p)
	case "parse_patch":
		var p string; json.Unmarshal(args[0], &p); result, err = dm.ParsePatch(p)
	case "merge3":
		var b, o, t string; var opts dm.MergeOptions
		json.Unmarshal(args[0], &b); json.Unmarshal(args[1], &o); json.Unmarshal(args[2], &t); if len(args) > 3 { json.Unmarshal(args[3], &opts) }
		result = dm.Merge3(b, o, t, opts)
	case "has_conflicts":
		var c string; json.Unmarshal(args[0], &c); result = dm.HasConflicts(c)
	case "extract_conflicts":
		var c string; json.Unmarshal(args[0], &c); result = dm.ExtractConflicts(c)
	case "resolve_conflict":
		var c string; var i int; var r string
		json.Unmarshal(args[0], &c); json.Unmarshal(args[1], &i); json.Unmarshal(args[2], &r); result = dm.ResolveConflict(c, i, r)
	case "is_binary":
		var c string; json.Unmarshal(args[0], &c); result = dm.IsBinary(c)
	case "normalize_line_endings":
		var c string; json.Unmarshal(args[0], &c); result = dm.NormalizeLineEndings(c)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1]); os.Exit(1)
	}
	if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
	out, _ := json.Marshal(result); fmt.Println(string(out))
}
