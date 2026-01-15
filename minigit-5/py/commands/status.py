"""status command - Show working tree status."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_file_mode
from objects import Blob, Tree, Commit
from index import Index
from refs import resolve_head, get_current_branch, is_head_detached


def run(args: list[str]) -> int:
    """Show the working tree status."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse flags
    short_format = '--short' in args or '-s' in args
    porcelain = '--porcelain' in args

    index = Index.read(repo_root)
    head_sha = resolve_head(repo_root)

    # Get HEAD tree entries
    head_entries = {}
    if head_sha:
        commit = Commit.read(head_sha, repo_root)
        head_entries = get_tree_entries(repo_root, commit.tree_sha)

    # Get working tree files
    work_tree_files = get_work_tree_files(repo_root)

    # Categorize changes
    staged_new = []
    staged_modified = []
    staged_deleted = []
    unstaged_modified = []
    unstaged_deleted = []
    untracked = []

    # Check index vs HEAD (staged changes)
    for name, entry in index.entries.items():
        if name not in head_entries:
            staged_new.append(name)
        elif entry.sha != head_entries[name][0]:
            staged_modified.append(name)

    # Check HEAD entries removed from index
    for name in head_entries:
        if name not in index.entries:
            staged_deleted.append(name)

    # Check working tree vs index (unstaged changes)
    for name, entry in index.entries.items():
        file_path = repo_root / name
        if not file_path.exists():
            if name not in staged_deleted:
                unstaged_deleted.append(name)
        else:
            work_sha = get_file_sha(file_path)
            if work_sha != entry.sha:
                unstaged_modified.append(name)

    # Find untracked files
    tracked = set(index.entries.keys())
    for rel_path in work_tree_files:
        if rel_path not in tracked:
            untracked.append(rel_path)

    # Output
    if short_format or porcelain:
        return output_short(staged_new, staged_modified, staged_deleted,
                          unstaged_modified, unstaged_deleted, untracked)
    else:
        return output_long(repo_root, staged_new, staged_modified, staged_deleted,
                         unstaged_modified, unstaged_deleted, untracked)


def get_tree_entries(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Recursively get all entries from a tree."""
    entries = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            # Subtree
            entries.update(get_tree_entries(repo_root, entry.sha, full_path + '/'))
        else:
            entries[full_path] = (entry.sha, entry.mode)

    return entries


def get_work_tree_files(repo_root: Path) -> list:
    """Get all files in working tree."""
    files = []
    for item in repo_root.rglob('*'):
        if item.is_file() and '.minigit' not in item.parts:
            try:
                rel_path = item.relative_to(repo_root)
                files.append(str(rel_path).replace(os.sep, '/'))
            except ValueError:
                pass
    return sorted(files)


def get_file_sha(file_path: Path) -> str:
    """Get SHA of a file."""
    if file_path.is_symlink():
        content = os.readlink(file_path).encode()
    else:
        content = file_path.read_bytes()
    blob = Blob(content)
    return blob.sha


def output_short(staged_new, staged_modified, staged_deleted,
                unstaged_modified, unstaged_deleted, untracked) -> int:
    """Output short format status."""
    for name in sorted(staged_new):
        x = 'A'
        y = ' '
        if name in unstaged_modified:
            y = 'M'
        print(f"{x}{y} {name}")

    for name in sorted(staged_modified):
        x = 'M'
        y = ' '
        if name in unstaged_modified:
            y = 'M'
        print(f"{x}{y} {name}")

    for name in sorted(staged_deleted):
        print(f"D  {name}")

    for name in sorted(unstaged_modified):
        if name not in staged_new and name not in staged_modified:
            print(f" M {name}")

    for name in sorted(unstaged_deleted):
        if name not in staged_deleted:
            print(f" D {name}")

    for name in sorted(untracked):
        print(f"?? {name}")

    return 0


def output_long(repo_root, staged_new, staged_modified, staged_deleted,
               unstaged_modified, unstaged_deleted, untracked) -> int:
    """Output long format status."""
    branch = get_current_branch(repo_root)
    if branch:
        print(f"On branch {branch}")
    else:
        print("HEAD detached")

    has_staged = staged_new or staged_modified or staged_deleted
    has_unstaged = unstaged_modified or unstaged_deleted

    if has_staged:
        print("\nChanges to be committed:")
        print("  (use \"minigit restore --staged <file>...\" to unstage)")
        for name in sorted(staged_new):
            print(f"\tnew file:   {name}")
        for name in sorted(staged_modified):
            print(f"\tmodified:   {name}")
        for name in sorted(staged_deleted):
            print(f"\tdeleted:    {name}")

    if has_unstaged:
        print("\nChanges not staged for commit:")
        print("  (use \"minigit add <file>...\" to update what will be committed)")
        for name in sorted(unstaged_modified):
            if name not in staged_new:
                print(f"\tmodified:   {name}")
        for name in sorted(unstaged_deleted):
            if name not in staged_deleted:
                print(f"\tdeleted:    {name}")

    if untracked:
        print("\nUntracked files:")
        print("  (use \"minigit add <file>...\" to include in what will be committed)")
        for name in sorted(untracked):
            print(f"\t{name}")

    if not has_staged and not has_unstaged and not untracked:
        print("\nnothing to commit, working tree clean")

    return 0
