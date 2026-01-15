# Mini Git: Python Implementation

## Task

Implement a Mini Git version control system in Python. All 175 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `py/` directory
- Run any bash commands (pip install, pytest, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party git/VCS libraries (e.g., gitpython, dulwich, pygit2)
- Do NOT use any libraries that implement git functionality
- Only standard library modules are allowed (hashlib, zlib, struct, os, pathlib, argparse, etc.)

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `py/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `go/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 175 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory, `spec.md`, and `conftest.py` to understand the test interface.

## IMPORTANT: CLI Entry Point

**You MUST create `minigit.py` as the CLI entry point that:**
1. Reads command from `sys.argv[1]`
2. Processes remaining arguments from `sys.argv[2:]`
3. Delegates to command modules (does NOT implement commands itself)
4. Exits with appropriate status codes

The tests invoke: `python3 py/minigit.py <command> [args...]`

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

**CRITICAL: Each of the 18 commands MUST be in its own separate file in the `commands/` directory.**

```
py/
├── minigit.py              # CLI entry point ONLY - MUST be under 100 lines
├── commands/               # ONE FILE PER COMMAND (18 files required)
│   ├── __init__.py         # Package init
│   ├── init.py             # init command
│   ├── add.py              # add command
│   ├── commit.py           # commit command
│   ├── status.py           # status command
│   ├── log.py              # log command
│   ├── diff.py             # diff command
│   ├── branch.py           # branch command
│   ├── checkout.py         # checkout command
│   ├── merge.py            # merge command
│   ├── tag.py              # tag command
│   ├── show.py             # show command
│   ├── cat_file.py         # cat-file command
│   ├── ls_tree.py          # ls-tree command
│   ├── ls_files.py         # ls-files command
│   ├── rev_parse.py        # rev-parse command
│   ├── hash_object.py      # hash-object command
│   ├── update_ref.py       # update-ref command
│   └── symbolic_ref.py     # symbolic-ref command
├── objects.py              # Blob, Tree, Commit, Tag handling
├── index.py                # Binary index read/write
├── refs.py                 # Reference management (HEAD, branches, tags)
├── diff_algo.py            # Myers diff algorithm
├── merge_algo.py           # Three-way merge with conflict detection
└── utils.py                # SHA-1, zlib, path utilities
```

**MANDATORY REQUIREMENTS:**
- `minigit.py` MUST be under 100 lines - it ONLY parses the command name and delegates
- Each of the 18 commands MUST be in its own file in `commands/` directory
- Each core module (`objects.py`, `index.py`, `refs.py`, `diff_algo.py`, `merge_algo.py`, `utils.py`) MUST exist
- **MINIMUM 25 FILES REQUIRED** (1 entry + 19 command files + 6 core modules)
- This structure is REQUIRED and will be verified

### Key Libraries
- `hashlib` for SHA-1
- `zlib` for compression
- `struct` for binary index format
- `os`, `pathlib` for file operations
- `argparse` or manual argv parsing for CLI

### Commands to Implement (18 total)

**Core Commands:**
- `init` - Initialize repository
- `add` - Stage files
- `commit` - Create commit
- `status` - Show status
- `log` - Show history
- `diff` - Show changes

**Branch Commands:**
- `branch` - Manage branches
- `checkout` - Switch branches/restore files
- `merge` - Merge branches
- `tag` - Manage tags

**Inspection Commands:**
- `show` - Show object content
- `cat-file` - Examine objects
- `ls-tree` - List tree contents
- `ls-files` - List indexed files
- `rev-parse` - Resolve revisions

**Low-level Commands:**
- `hash-object` - Compute hash
- `update-ref` - Update reference
- `symbolic-ref` - Manage symbolic refs

## Testing

Run tests from the `py/` directory:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/minigit-5/py
MINIGIT_IMPL=py pytest ../tests -v
```

Run specific test file:
```bash
MINIGIT_IMPL=py pytest ../tests/test_init.py -v
```

## Success Criteria

- All 175 tests pass
- Implementation only in `py/` directory
- CLI entry point is `minigit.py`
- **MUST have exactly 25+ files** (entry point + 19 command files + 6 core modules)
- **Entry point MUST be under 100 lines**
- **Each command MUST be in its own file**
