# Diff/Merge Library: Go Implementation

## Task

Implement a Diff/Merge library in Go. All 125 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `go/` directory
- Run any bash commands (go build, go mod, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party diff/merge libraries (e.g., go-diff, godiff)
- Only Go standard library is allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `go/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 125 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the test interface.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
go/
├── go.mod
├── main.go              # CLI entry point for testing (under 50 lines)
├── diffmerge/           # Package directory
│   ├── types.go         # All type definitions
│   ├── diff.go          # diff_lines, diff_words, diff_chars, LCS algorithm
│   ├── patch.go         # create_patch, apply_patch, reverse_patch, parse_patch
│   ├── merge.go         # merge3, has_conflicts, extract_conflicts, resolve_conflict
│   └── utils.go         # get_stats, is_binary, normalize_line_endings, split_lines
```

**MANDATORY REQUIREMENTS:**
- `main.go` MUST be under 50 lines - it only provides CLI interface for tests
- Each module (`types.go`, `diff.go`, `patch.go`, `merge.go`, `utils.go`) MUST exist as a separate file in diffmerge/
- **MINIMUM 6 .go FILES REQUIRED** (1 main + 5 in diffmerge/)
- This structure is REQUIRED and will be verified

### Module Responsibilities

**types.go:**
- `DiffOp`, `DiffHunk`, `DiffResult`, `DiffStats`
- `MergeResult`, `Conflict`
- `ApplyResult`, `ParsedPatch`, `PatchHunk`, `PatchLine`
- `DiffOptions`, `PatchOptions`, `MergeOptions`

**diff.go:**
- `DiffLines(old, new string, options DiffOptions) DiffResult`
- `DiffWords(old, new string) []DiffHunk`
- `DiffChars(old, new string) []DiffHunk`
- LCS algorithm implementation

**patch.go:**
- `CreatePatch(old, new string, options PatchOptions) string`
- `ApplyPatch(content, patch string) ApplyResult`
- `ReversePatch(patch string) string`
- `ParsePatch(patch string) ParsedPatch`

**merge.go:**
- `Merge3(base, ours, theirs string, options MergeOptions) MergeResult`
- `HasConflicts(content string) bool`
- `ExtractConflicts(content string) []Conflict`
- `ResolveConflict(content string, index int, resolution string) string`

**utils.go:**
- `GetStats(diff DiffResult) DiffStats`
- `IsBinary(content string) bool`
- `NormalizeLineEndings(content string) string`
- `SplitLines(content string) []string`

## Setup

Initialize Go module:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/diffmerge-2/go
go mod init diffmerge
```

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/diffmerge-2/go
go build -o diffmerge .
cd ..
IMPL=go pytest tests -v
```

## Success Criteria

- All 125 tests pass
- Implementation only in `go/` directory
- `go build` succeeds without errors
- **MUST have modular structure with 6 .go files** (1 main + 5 in diffmerge/)
- **`main.go` MUST be under 50 lines**
- Each function in the correct module as specified above
