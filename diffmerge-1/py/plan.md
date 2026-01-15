# Diff/Merge Library: Python Implementation

## Task

Implement a Diff/Merge library in Python. All 125 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `py/` directory
- Run any bash commands (pip install, pytest, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party diff/merge libraries (e.g., difflib alternatives, unidiff, whatthepatch)
- You MAY use Python's built-in `difflib` only for reference/comparison, but your implementation must be custom
- Only standard library modules are allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `py/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `go/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 125 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the test interface.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
py/
├── diffmerge/
│   ├── __init__.py      # Package init - exports public API (under 50 lines)
│   ├── diff.py          # diff_lines, diff_words, diff_chars, LCS algorithm
│   ├── patch.py         # create_patch, apply_patch, reverse_patch, parse_patch
│   ├── merge.py         # merge3, has_conflicts, extract_conflicts, resolve_conflict
│   ├── utils.py         # get_stats, is_binary, normalize_line_endings, split_lines
│   └── types.py         # All type definitions (DiffHunk, MergeResult, etc.)
```

**MANDATORY REQUIREMENTS:**
- `__init__.py` MUST be under 50 lines - it only imports and re-exports from modules
- Each module (`diff.py`, `patch.py`, `merge.py`, `utils.py`, `types.py`) MUST exist as a separate file
- **MINIMUM 6 FILES REQUIRED** in the diffmerge/ package
- This structure is REQUIRED and will be verified

### Module Responsibilities

**diff.py:**
- `diff_lines(old, new, options)` - Line-by-line diff using LCS
- `diff_words(old, new)` - Word-by-word diff
- `diff_chars(old, new)` - Character diff
- LCS algorithm implementation

**patch.py:**
- `create_patch(old, new, options)` - Generate unified diff
- `apply_patch(content, patch)` - Apply patch to content
- `reverse_patch(patch)` - Reverse a patch
- `parse_patch(patch)` - Parse unified diff format

**merge.py:**
- `merge3(base, ours, theirs, options)` - Three-way merge
- `has_conflicts(content)` - Check for conflict markers
- `extract_conflicts(content)` - Extract conflict regions
- `resolve_conflict(content, index, resolution)` - Resolve conflict

**utils.py:**
- `get_stats(diff)` - Get diff statistics
- `is_binary(content)` - Detect binary content
- `normalize_line_endings(content)` - Normalize to \n
- `split_lines(content)` - Split into lines

**types.py:**
- `DiffOp`, `DiffHunk`, `DiffResult`, `DiffStats`
- `MergeResult`, `Conflict`
- `ApplyResult`, `ParsedPatch`, `PatchHunk`, `PatchLine`
- `DiffOptions`, `PatchOptions`, `MergeOptions`

## Testing

Run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/diffmerge-1
IMPL=py pytest tests -v
```

Run specific test file:
```bash
IMPL=py pytest tests/test_diff_lines.py -v
```

## Success Criteria

- All 125 tests pass
- Implementation only in `py/` directory
- **MUST have modular structure with 6 separate files in diffmerge/**
- **`__init__.py` MUST be under 50 lines**
- Each function in the correct module as specified above
