"""diff command - Show changes."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, is_binary
from objects import read_object, Commit, Tree, resolve_object, hash_object
from index import Index
from refs import resolve_head
from diff_algo import format_unified_diff


def get_tree_files(tree_sha: str, repo_root: Path) -> dict:
    """Get all files from a tree as {path: sha}."""
    files = {}

    def walk_tree(sha: str, prefix: str):
        try:
            _, data = read_object(sha, repo_root)
            tree = Tree.deserialize(data)
            for entry in tree.entries:
                path = f'{prefix}{entry.name}' if prefix else entry.name
                if entry.mode.startswith('40'):
                    walk_tree(entry.sha, path + '/')
                else:
                    files[path] = entry.sha
        except:
            pass

    walk_tree(tree_sha, '')
    return files


def get_blob_content(sha: str, repo_root: Path) -> bytes:
    """Get content of a blob."""
    _, data = read_object(sha, repo_root)
    return data


def run(args):
    """Show differences."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    cached = False
    stat_only = False
    paths = []
    commits = []
    separator_seen = False

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--':
            separator_seen = True
        elif separator_seen:
            paths.append(arg)
        elif arg in ('--cached', '--staged'):
            cached = True
        elif arg == '--stat':
            stat_only = True
        elif not arg.startswith('-'):
            # Could be a commit or a path
            try:
                sha = resolve_object(arg, repo_root)
                commits.append(sha)
            except:
                paths.append(arg)
        i += 1

    # Determine what to compare
    index = Index.read(repo_root)

    if len(commits) == 2:
        # Compare two commits
        old_sha, new_sha = commits
        _, old_data = read_object(old_sha, repo_root)
        old_commit = Commit.deserialize(old_data)
        _, new_data = read_object(new_sha, repo_root)
        new_commit = Commit.deserialize(new_data)

        old_files = get_tree_files(old_commit.tree_sha, repo_root)
        new_files = get_tree_files(new_commit.tree_sha, repo_root)

        show_diff(old_files, new_files, repo_root, paths, stat_only, from_tree=True, repo_root_for_worktree=None)

    elif len(commits) == 1:
        # Compare commit to working tree
        commit_sha = commits[0]
        _, data = read_object(commit_sha, repo_root)
        commit = Commit.deserialize(data)

        old_files = get_tree_files(commit.tree_sha, repo_root)

        # Get working tree files for all paths in commit tree
        new_files = {}
        for name in old_files.keys():
            file_path = repo_root / name
            if file_path.exists():
                try:
                    content = get_worktree_content(name, repo_root)
                    sha = hash_object(content, 'blob')
                    new_files[name] = sha
                except:
                    pass

        show_diff(old_files, new_files, repo_root, paths, stat_only, from_tree=False, repo_root_for_worktree=repo_root)

    elif cached:
        # Compare HEAD to index (staged changes)
        head_sha = resolve_head(repo_root)
        if head_sha:
            _, data = read_object(head_sha, repo_root)
            commit = Commit.deserialize(data)
            old_files = get_tree_files(commit.tree_sha, repo_root)
        else:
            old_files = {}

        new_files = {name: entry.sha for name, entry in index.entries.items()}

        show_diff(old_files, new_files, repo_root, paths, stat_only, from_tree=True, repo_root_for_worktree=None)

    else:
        # Compare index to working tree (unstaged changes)
        old_files = {name: entry.sha for name, entry in index.entries.items()}
        new_files = get_worktree_files_from_index(repo_root, index)

        show_diff(old_files, new_files, repo_root, paths, stat_only, from_tree=False, repo_root_for_worktree=repo_root)

    return 0


def get_worktree_files_from_index(repo_root: Path, index: Index) -> dict:
    """Get current working tree files for paths in index as {path: sha}."""
    files = {}
    for name in index.entries.keys():
        file_path = repo_root / name
        if file_path.exists():
            try:
                if file_path.is_symlink():
                    content = os.readlink(file_path).encode()
                else:
                    content = file_path.read_bytes()
                sha = hash_object(content, 'blob')
                files[name] = sha
            except:
                pass
    return files


def get_worktree_content(name: str, repo_root: Path) -> bytes:
    """Get content of a file in working tree."""
    file_path = repo_root / name
    if file_path.exists():
        if file_path.is_symlink():
            return os.readlink(file_path).encode()
        else:
            return file_path.read_bytes()
    return b''


def show_diff(old_files: dict, new_files: dict, repo_root: Path,
              paths: list, stat_only: bool, from_tree: bool,
              repo_root_for_worktree: Path = None):
    """Show diff between two file sets."""
    all_files = set(old_files.keys()) | set(new_files.keys())

    if paths:
        # Filter to specific paths
        filtered = set()
        for p in paths:
            for f in all_files:
                if f == p or f.startswith(p + '/'):
                    filtered.add(f)
        all_files = filtered

    for name in sorted(all_files):
        old_sha = old_files.get(name)
        new_sha = new_files.get(name)

        if old_sha == new_sha:
            continue

        # Get content for stat calculation
        if old_sha:
            old_content = get_blob_content(old_sha, repo_root)
        else:
            old_content = b''

        if new_sha:
            if from_tree:
                new_content = get_blob_content(new_sha, repo_root)
            else:
                # Read from working tree
                new_content = get_worktree_content(name, repo_root_for_worktree or repo_root)
        else:
            new_content = b''

        if stat_only:
            # Calculate insertions/deletions
            try:
                old_lines = old_content.decode('utf-8').splitlines()
                new_lines = new_content.decode('utf-8').splitlines()
                insertions = 0
                deletions = 0
                # Simple line count diff
                if len(new_lines) > len(old_lines):
                    insertions = len(new_lines) - len(old_lines)
                elif len(old_lines) > len(new_lines):
                    deletions = len(old_lines) - len(new_lines)
                # Count changed lines
                for i, line in enumerate(old_lines):
                    if i >= len(new_lines) or line != new_lines[i]:
                        deletions += 1
                for i, line in enumerate(new_lines):
                    if i >= len(old_lines) or line != old_lines[i]:
                        insertions += 1
                # Remove duplicates from resize
                if len(new_lines) > len(old_lines):
                    insertions -= len(new_lines) - len(old_lines)
                elif len(old_lines) > len(new_lines):
                    deletions -= len(old_lines) - len(new_lines)
                stat_str = ''
                if insertions > 0:
                    stat_str += '+' * min(insertions, 10)
                if deletions > 0:
                    stat_str += '-' * min(deletions, 10)
                if not stat_str:
                    stat_str = '+-'
                print(f' {name} | {insertions + deletions} {stat_str}')
            except:
                if old_sha is None:
                    print(f' {name} | new file')
                elif new_sha is None:
                    print(f' {name} | deleted')
                else:
                    print(f' {name} | binary')
            continue

        # Check for binary
        if is_binary(old_content) or is_binary(new_content):
            print(f'diff --git a/{name} b/{name}')
            print(f'Binary files a/{name} and b/{name} differ')
            continue

        # Text diff
        try:
            old_text = old_content.decode('utf-8')
            new_text = new_content.decode('utf-8')
        except UnicodeDecodeError:
            print(f'diff --git a/{name} b/{name}')
            print(f'Binary files a/{name} and b/{name} differ')
            continue

        old_lines = old_text.splitlines(keepends=False)
        new_lines = new_text.splitlines(keepends=False)

        diff_output = format_unified_diff(f'a/{name}', f'b/{name}', old_lines, new_lines)

        if diff_output:
            print(f'diff --git a/{name} b/{name}')
            if old_sha is None:
                print('new file mode 100644')
            elif new_sha is None:
                print('deleted file mode 100644')
            print(diff_output)
