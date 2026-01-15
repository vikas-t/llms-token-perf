"""status command - Show working tree status."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from objects import read_object, Commit, Tree, resolve_object
from index import Index
from refs import get_current_branch, resolve_head


def get_head_tree_files(repo_root: Path) -> dict:
    """Get files from HEAD commit's tree."""
    head_sha = resolve_head(repo_root)
    if not head_sha:
        return {}

    try:
        _, data = read_object(head_sha, repo_root)
        commit = Commit.deserialize(data)

        files = {}
        collect_tree_files(commit.tree_sha, '', files, repo_root)
        return files
    except:
        return {}


def collect_tree_files(tree_sha: str, prefix: str, files: dict, repo_root: Path):
    """Recursively collect files from a tree."""
    try:
        _, data = read_object(tree_sha, repo_root)
        tree = Tree.deserialize(data)

        for entry in tree.entries:
            path = f'{prefix}{entry.name}' if prefix else entry.name
            if entry.mode.startswith('40'):  # Directory
                collect_tree_files(entry.sha, path + '/', files, repo_root)
            else:
                files[path] = entry.sha
    except:
        pass


def run(args):
    """Show working tree status."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse flags
    short_format = False
    porcelain = False

    for arg in args:
        if arg in ('--short', '-s'):
            short_format = True
        elif arg == '--porcelain':
            porcelain = True

    # Read index
    index = Index.read(repo_root)

    # Get files from HEAD
    head_files = get_head_tree_files(repo_root)

    # Classify changes
    staged_new = []
    staged_modified = []
    staged_deleted = []
    not_staged_modified = []
    not_staged_deleted = []
    untracked = []

    # Check indexed files
    indexed_files = set(index.entries.keys())

    for name, entry in index.entries.items():
        file_path = repo_root / name

        # Check if staged (different from HEAD)
        head_sha = head_files.get(name)
        if head_sha is None:
            staged_new.append(name)
        elif head_sha != entry.sha:
            staged_modified.append(name)

        # Check working tree vs index
        if file_path.exists():
            try:
                if file_path.is_symlink():
                    content = os.readlink(file_path).encode()
                else:
                    content = file_path.read_bytes()
                from objects import hash_object
                worktree_sha = hash_object(content, 'blob')
                if worktree_sha != entry.sha:
                    not_staged_modified.append(name)
            except:
                pass
        else:
            not_staged_deleted.append(name)

    # Check for deleted files in HEAD but not in index
    for name in head_files:
        if name not in indexed_files:
            staged_deleted.append(name)

    # Find untracked files
    for file_path in repo_root.rglob('*'):
        if file_path.is_file():
            try:
                rel = str(file_path.relative_to(repo_root))
                if '.minigit' in rel:
                    continue
                if rel not in indexed_files:
                    untracked.append(rel)
            except ValueError:
                pass

    # Output
    if short_format or porcelain:
        # Short/porcelain format: XY filename
        for name in sorted(staged_new):
            if name in not_staged_modified:
                print(f'AM {name}')
            elif name in not_staged_deleted:
                print(f'AD {name}')
            else:
                print(f'A  {name}')

        for name in sorted(staged_modified):
            if name in not_staged_modified:
                print(f'MM {name}')
            elif name in not_staged_deleted:
                print(f'MD {name}')
            else:
                print(f'M  {name}')

        for name in sorted(staged_deleted):
            print(f'D  {name}')

        for name in sorted(set(not_staged_modified) - set(staged_new) - set(staged_modified)):
            print(f' M {name}')

        for name in sorted(set(not_staged_deleted) - set(staged_new) - set(staged_modified)):
            print(f' D {name}')

        for name in sorted(untracked):
            print(f'?? {name}')
    else:
        # Long format
        branch = get_current_branch(repo_root)
        if branch:
            print(f'On branch {branch}')
        else:
            print('HEAD detached')

        has_output = False

        # Staged changes
        staged_all = staged_new + staged_modified + staged_deleted
        if staged_all:
            print()
            print('Changes to be committed:')
            print('  (use "minigit restore --staged <file>..." to unstage)')
            print()
            for name in sorted(staged_new):
                print(f'\tnew file:   {name}')
            for name in sorted(staged_modified):
                print(f'\tmodified:   {name}')
            for name in sorted(staged_deleted):
                print(f'\tdeleted:    {name}')
            has_output = True

        # Not staged changes
        not_staged_all = list(set(not_staged_modified) | set(not_staged_deleted))
        if not_staged_all:
            print()
            print('Changes not staged for commit:')
            print('  (use "minigit add <file>..." to update what will be committed)')
            print()
            for name in sorted(not_staged_modified):
                print(f'\tmodified:   {name}')
            for name in sorted(not_staged_deleted):
                print(f'\tdeleted:    {name}')
            has_output = True

        # Untracked
        if untracked:
            print()
            print('Untracked files:')
            print('  (use "minigit add <file>..." to include in what will be committed)')
            print()
            for name in sorted(untracked):
                print(f'\t{name}')
            has_output = True

        if not has_output:
            head_sha = resolve_head(repo_root)
            if head_sha:
                print()
                print('nothing to commit, working tree clean')
            else:
                print()
                print('No commits yet')
                if not index.entries:
                    print()
                    print('nothing to commit (create/copy files and use "minigit add" to track)')

    return 0
