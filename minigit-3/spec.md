# Mini Git Specification

A simplified Git implementation with 18 commands. All 175 tests must pass.

## Overview

Implement a Git-like version control system called `minigit`. The implementation should:
- Store data in `.minigit/` directory (not `.git/`)
- Use SHA-1 hashing for object IDs
- Support zlib compression for objects
- Implement binary index format
- Handle branches, tags, and references

## Directory Structure

```
.minigit/
├── HEAD              # Current branch reference: "ref: refs/heads/main"
├── config            # Repository configuration (INI format)
├── index             # Binary staging area
├── objects/          # Object storage (blobs, trees, commits)
│   ├── info/
│   └── pack/
└── refs/
    ├── heads/        # Branch references
    └── tags/         # Tag references
```

## Object Model

### Blob
Raw file content, stored as: `blob <size>\0<content>`

### Tree
Directory listing, format per entry: `<mode> <name>\0<20-byte-sha>`
- Mode 100644 for regular files
- Mode 100755 for executable files
- Mode 40000 for directories

### Commit
```
tree <tree-sha>
parent <parent-sha>      # Optional, can have multiple
author <name> <email> <timestamp> <tz>
committer <name> <email> <timestamp> <tz>

<message>
```

### Tag (annotated)
```
object <sha>
type commit
tag <name>
tagger <name> <email> <timestamp> <tz>

<message>
```

## Commands

### 1. init [directory]
Initialize a new repository.

**Behavior:**
- Creates `.minigit/` directory structure
- Creates `HEAD` pointing to `refs/heads/main`
- Creates empty `config` file
- Fails if `.minigit/` already exists

**Exit codes:** 0 on success, non-zero if repo exists

### 2. add <pathspec>...
Stage files for commit.

**Flags:**
- `-A, --all`: Stage all changes (new, modified, deleted)
- `-u, --update`: Stage modified and deleted (not new)

**Behavior:**
- Creates blob objects for file contents
- Updates index with file entries
- Handles directories recursively
- Preserves file modes (644/755)

### 3. commit -m <message>
Create a new commit.

**Behavior:**
- Creates tree object from index
- Creates commit object with message, author, committer
- Updates current branch reference
- Outputs commit SHA (short form)

**Environment variables:**
- `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`
- `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`
- `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`

### 4. status [--short]
Show working tree status.

**Output sections:**
- Changes staged for commit
- Changes not staged
- Untracked files

**Short format:** `XY filename` where X=index status, Y=worktree status

### 5. log [--oneline] [--all] [-n <count>] [<revision>]
Show commit history.

**Flags:**
- `--oneline`: One line per commit (short SHA + message)
- `--all`: Show all branches
- `-n <count>`: Limit number of commits

**Default format:**
```
commit <sha>
Author: <name> <email>
Date:   <date>

    <message>
```

### 6. diff [--cached] [<path>...]
Show changes.

**Modes:**
- No args: Working tree vs index (unstaged changes)
- `--cached`: Index vs HEAD (staged changes)
- `<path>`: Filter to specific files

**Output:** Unified diff format with `---`, `+++`, `@@` hunks

### 7. branch [-d|-D] [-m] [-v] [<name>] [<start-point>]
List, create, or delete branches.

**Flags:**
- No args: List branches (* marks current)
- `<name>`: Create branch
- `-d <name>`: Delete branch (fails if not merged)
- `-D <name>`: Force delete branch
- `-m <old> <new>`: Rename branch
- `-v`: Verbose (show commit SHA and message)

**Rules:**
- Cannot delete current branch
- Branch names cannot contain spaces or start with `-`

### 8. checkout [-b] <branch|commit|file>
Switch branches or restore files.

**Modes:**
- `checkout <branch>`: Switch to branch
- `checkout -b <new>`: Create and switch to new branch
- `checkout <sha>`: Detached HEAD mode
- `checkout <file>`: Restore file from index
- `checkout <commit> -- <file>`: Restore file from commit

**Behavior:**
- Updates working tree to match target
- Fails if uncommitted changes would be overwritten
- Preserves untracked files

### 9. merge <branch>
Merge branch into current branch.

**Scenarios:**
- Fast-forward: Move branch pointer (no merge commit)
- Three-way merge: Create merge commit with two parents
- Conflicts: Mark files with conflict markers, exit non-zero

**Conflict markers:**
```
<<<<<<< HEAD
current content
=======
incoming content
>>>>>>> branch-name
```

### 10. tag [-a] [-d] [-l] [<name>] [<commit>]
Create, list, or delete tags.

**Flags:**
- No args or `-l`: List tags
- `<name>`: Create lightweight tag
- `-a <name> -m <message>`: Create annotated tag
- `-d <name>`: Delete tag

### 11. show [<object>]
Show object content.

**For commits:** Full commit info + diff from parent
**For tags:** Tag info + referenced object
**For trees:** Tree listing
**For blobs:** Raw content

### 12. cat-file (-t|-s|-p) <object>
Examine object internals.

**Flags:**
- `-t`: Show object type (blob/tree/commit/tag)
- `-s`: Show object size
- `-p`: Pretty-print content

### 13. ls-tree [-r] [--name-only] <tree-ish>
List tree contents.

**Flags:**
- `-r`: Recurse into subtrees
- `--name-only`: Only show names

**Default format:** `<mode> <type> <sha>\t<name>`

### 14. ls-files [--stage]
List indexed files.

**Flags:**
- `--stage`: Show staged entries with mode and SHA

### 15. rev-parse <revision>
Resolve revision to SHA.

**Supported formats:**
- `HEAD`, `main`, `v1.0` (refs)
- `HEAD^`, `HEAD~2` (parent traversal)
- `abc123` (short SHA)
- Full 40-char SHA

### 16. hash-object [-w] [-t <type>] <file>
Compute object hash.

**Flags:**
- `-w`: Write object to database
- `-t <type>`: Object type (default: blob)

### 17. update-ref <ref> <sha>
Update a reference.

**Examples:**
- `update-ref refs/heads/main abc123`
- `update-ref HEAD abc123`

### 18. symbolic-ref <ref> [<target>]
Read or update symbolic reference.

**Examples:**
- `symbolic-ref HEAD` → returns `refs/heads/main`
- `symbolic-ref HEAD refs/heads/feature`

## Index Format

Binary format (simplified):
```
DIRC                    # Magic signature (4 bytes)
<version>               # Version number (4 bytes, big-endian)
<entry-count>           # Number of entries (4 bytes, big-endian)
<entries>               # Index entries
<sha-1>                 # Checksum (20 bytes)
```

Each entry:
```
<ctime>                 # 8 bytes
<mtime>                 # 8 bytes
<dev>                   # 4 bytes
<ino>                   # 4 bytes
<mode>                  # 4 bytes
<uid>                   # 4 bytes
<gid>                   # 4 bytes
<size>                  # 4 bytes
<sha>                   # 20 bytes
<flags>                 # 2 bytes (includes name length)
<name>                  # Variable length, null-terminated
<padding>               # 1-8 bytes to align to 8-byte boundary
```

## CLI Interface

The CLI is invoked as: `minigit <command> [args...]`

All output goes to stdout. Errors go to stderr.
Exit code 0 for success, non-zero for errors.

## Test Environment

Tests set these environment variables:
- `GIT_AUTHOR_NAME=Test User`
- `GIT_AUTHOR_EMAIL=test@example.com`
- `GIT_COMMITTER_NAME=Test User`
- `GIT_COMMITTER_EMAIL=test@example.com`
- `GIT_AUTHOR_DATE=2024-01-01T00:00:00+00:00`
- `GIT_COMMITTER_DATE=2024-01-01T00:00:00+00:00`

## Running Tests

```bash
# From minigit-1 directory
cd py && MINIGIT_IMPL=py pytest ../tests -v
cd ts && MINIGIT_IMPL=ts pytest ../tests -v
cd go && MINIGIT_IMPL=go pytest ../tests -v
```
