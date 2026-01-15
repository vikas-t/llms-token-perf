# Mini Git: Go Implementation

## Task

Implement a Mini Git version control system in Go. All 175 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `go/` directory
- Run any bash commands (go build, go mod, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party git/VCS libraries (e.g., go-git, git2go)
- Do NOT use any libraries that implement git functionality
- Only Go standard library is allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `go/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 175 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory, `spec.md`, and `conftest.py` to understand the test interface.

## IMPORTANT: CLI Entry Point

**You MUST build a binary called `minigit`:**
1. Reads command from `os.Args[1]`
2. Processes remaining arguments from `os.Args[2:]`
3. Delegates to command functions (does NOT implement commands in main.go)
4. Exits with appropriate status codes

The tests invoke: `go/minigit <command> [args...]`

## MANDATORY: Modular Package Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

**CRITICAL: Each of the 18 commands MUST be in its own separate file in the `cmd/` package.**

```
go/
├── go.mod
├── go.sum
├── main.go                 # CLI entry point ONLY - MUST be under 100 lines
├── cmd/                    # ONE FILE PER COMMAND (18 files required)
│   ├── init.go             # init command
│   ├── add.go              # add command
│   ├── commit.go           # commit command
│   ├── status.go           # status command
│   ├── log.go              # log command
│   ├── diff.go             # diff command
│   ├── branch.go           # branch command
│   ├── checkout.go         # checkout command
│   ├── merge.go            # merge command
│   ├── tag.go              # tag command
│   ├── show.go             # show command
│   ├── catfile.go          # cat-file command
│   ├── lstree.go           # ls-tree command
│   ├── lsfiles.go          # ls-files command
│   ├── revparse.go         # rev-parse command
│   ├── hashobject.go       # hash-object command
│   ├── updateref.go        # update-ref command
│   └── symbolicref.go      # symbolic-ref command
├── objects/                # Object model
│   └── objects.go          # Blob, Tree, Commit, Tag handling
├── index/                  # Binary index handling
│   └── index.go            # Index read/write
├── refs/                   # Reference management
│   └── refs.go             # HEAD, branches, tags
├── diff/                   # Diff algorithm
│   └── diff.go             # Myers diff algorithm
├── merge/                  # Merge algorithm
│   └── merge.go            # Three-way merge with conflict detection
└── utils/                  # Utilities
    └── utils.go            # SHA-1, zlib, path utilities
```

**MANDATORY REQUIREMENTS:**
- `main.go` MUST be under 100 lines - it ONLY parses the command name and delegates to cmd package
- Each of the 18 commands MUST be in its own file in `cmd/` package
- Each core package (`objects/`, `index/`, `refs/`, `diff/`, `merge/`, `utils/`) MUST exist with at least one .go file
- **MINIMUM 25 .go FILES REQUIRED** (1 main + 18 command files + 6 package files)
- This structure is REQUIRED and will be verified

### Key Libraries (standard library only)
- `crypto/sha1` for SHA-1
- `compress/zlib` for compression
- `encoding/binary` for binary index format
- `os`, `path/filepath` for file operations
- `flag` or manual argv parsing for CLI

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

## Setup

Initialize Go module:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/minigit-3/go
go mod init minigit
```

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/minigit-3/go
go build -o minigit .
MINIGIT_IMPL=go pytest ../tests -v
```

## Success Criteria

- All 175 tests pass
- Implementation only in `go/` directory
- Binary builds as `minigit`
- `go build` succeeds without errors
- **MUST have exactly 25+ .go files** (1 main + 18 command files + 6 package files)
- **Entry point MUST be under 100 lines**
- **Each command MUST be in its own file**
