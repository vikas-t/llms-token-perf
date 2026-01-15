# Diff/Merge Library Specification

A comprehensive library for computing diffs, applying patches, and performing three-way merges.

## Core API

### Diff Types

```
DiffOp = "equal" | "insert" | "delete"

DiffHunk {
  op: DiffOp
  content: string
  old_start?: number  # line number in original (1-indexed)
  new_start?: number  # line number in new (1-indexed)
  old_count?: number  # number of lines in original
  new_count?: number  # number of lines in new
}

DiffResult {
  hunks: DiffHunk[]
  stats: DiffStats
}

DiffStats {
  additions: number
  deletions: number
  changes: number  # lines that were modified (delete+insert pairs)
}
```

### Merge Types

```
MergeResult {
  content: string
  has_conflicts: boolean
  conflicts: Conflict[]
}

Conflict {
  base: string
  ours: string
  theirs: string
  start_line: number
  end_line: number
}
```

### Functions

#### `diff_lines(old: string, new: string, options?: DiffOptions) -> DiffResult`
Compute line-by-line diff using LCS (Longest Common Subsequence) algorithm.

Options:
- `ignore_whitespace`: Ignore leading/trailing whitespace (default: false)
- `ignore_blank_lines`: Skip blank lines in comparison (default: false)
- `context_lines`: Number of context lines around changes (default: 3)

#### `diff_words(old: string, new: string) -> DiffHunk[]`
Compute word-by-word diff within a single line.

#### `diff_chars(old: string, new: string) -> DiffHunk[]`
Compute character-by-character diff.

#### `create_patch(old: string, new: string, options?: PatchOptions) -> string`
Generate unified diff format patch.

Options:
- `old_file`: Name of old file (default: "a")
- `new_file`: Name of new file (default: "b")
- `context_lines`: Context lines (default: 3)

#### `apply_patch(content: string, patch: string) -> ApplyResult`
Apply a unified diff patch to content.

```
ApplyResult {
  content: string
  success: boolean
  hunks_applied: number
  hunks_failed: number
  errors: string[]
}
```

#### `reverse_patch(patch: string) -> string`
Reverse a patch (swap additions and deletions).

#### `parse_patch(patch: string) -> ParsedPatch`
Parse unified diff format into structured data.

```
ParsedPatch {
  old_file: string
  new_file: string
  hunks: PatchHunk[]
}

PatchHunk {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  lines: PatchLine[]
}

PatchLine {
  op: " " | "+" | "-"
  content: string
}
```

#### `merge3(base: string, ours: string, theirs: string, options?: MergeOptions) -> MergeResult`
Three-way merge with conflict detection.

Options:
- `conflict_style`: "diff3" | "merge" (default: "merge")
- `ours_label`: Label for our changes (default: "ours")
- `theirs_label`: Label for their changes (default: "theirs")
- `base_label`: Label for base (default: "base", only used with diff3 style)

#### `has_conflicts(content: string) -> boolean`
Check if content contains conflict markers.

#### `extract_conflicts(content: string) -> Conflict[]`
Extract conflict regions from merged content.

#### `resolve_conflict(content: string, conflict_index: number, resolution: "ours" | "theirs" | "base" | string) -> string`
Resolve a specific conflict in the content.

### Utility Functions

#### `get_stats(diff: DiffResult) -> DiffStats`
Get statistics from a diff result.

#### `is_binary(content: string) -> boolean`
Detect if content appears to be binary (contains null bytes).

#### `normalize_line_endings(content: string) -> string`
Convert all line endings to \n.

#### `split_lines(content: string) -> string[]`
Split content into lines, preserving empty trailing line if present.

## Unified Diff Format

The library should produce and consume standard unified diff format:

```
--- a/file.txt
+++ b/file.txt
@@ -1,4 +1,5 @@
 unchanged line
-removed line
+added line
+another added line
 more context
 final line
```

## Conflict Markers

Standard conflict markers for three-way merge:

```
<<<<<<< ours
our version of the line
=======
their version of the line
>>>>>>> theirs
```

With diff3 style:
```
<<<<<<< ours
our version
||||||| base
base version
=======
their version
>>>>>>> theirs
```

## Error Handling

- `DiffError`: Base error for diff operations
- `PatchError`: Error applying patch (hunk doesn't match)
- `ParseError`: Error parsing patch format
- `MergeError`: Error during merge operation

## Edge Cases to Handle

1. Empty files (old or new)
2. No newline at end of file
3. Binary content detection
4. Very large files (streaming not required, but reasonable memory usage)
5. Unicode content
6. Mixed line endings (CRLF, LF, CR)
7. Patch offset adjustment (fuzzy matching)
8. Overlapping hunks
9. Already applied patches
10. Whitespace-only changes
