"""diff command - Show changes."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Blob, Tree, Commit
from index import Index
from refs import resolve_head, resolve_revision
from diff_algo import create_unified_diff


def run(args: list[str]) -> int:
    """Show changes between commits, index, and working tree."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    cached = False
    staged = False
    stat_only = False
    paths = []
    commits = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--cached':
            cached = True
        elif arg == '--staged':
            staged = True
        elif arg == '--stat':
            stat_only = True
        elif arg == '--':
            paths.extend(args[i + 1:])
            break
        elif not arg.startswith('-'):
            # Could be a commit or path
            sha = resolve_revision(repo_root, arg)
            if sha:
                commits.append(sha)
            else:
                paths.append(arg)
        i += 1

    if cached or staged:
        # Index vs HEAD
        return diff_staged(repo_root, paths, stat_only)
    elif len(commits) == 2:
        # Between two commits
        return diff_commits(repo_root, commits[0], commits[1], paths, stat_only)
    elif len(commits) == 1:
        # Working tree vs commit
        return diff_commit_worktree(repo_root, commits[0], paths, stat_only)
    else:
        # Working tree vs index
        return diff_unstaged(repo_root, paths, stat_only)


def diff_staged(repo_root: Path, paths: list, stat_only: bool) -> int:
    """Show staged changes (index vs HEAD)."""
    index = Index.read(repo_root)
    head_sha = resolve_head(repo_root)

    head_files = {}
    if head_sha:
        commit = Commit.read(head_sha, repo_root)
        head_files = get_tree_files(repo_root, commit.tree_sha)

    output = []

    # Compare index to HEAD
    all_files = set(index.entries.keys()) | set(head_files.keys())
    for name in sorted(all_files):
        if paths and not matches_path(name, paths):
            continue

        if name in index.entries and name not in head_files:
            # New file
            blob = Blob.read(index.entries[name].sha, repo_root)
            new_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if new_lines and new_lines[-1] == '':
                new_lines = new_lines[:-1]
            diff = create_unified_diff([], new_lines, f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)

        elif name not in index.entries and name in head_files:
            # Deleted file
            blob = Blob.read(head_files[name], repo_root)
            old_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if old_lines and old_lines[-1] == '':
                old_lines = old_lines[:-1]
            diff = create_unified_diff(old_lines, [], f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)

        elif name in index.entries and name in head_files:
            if index.entries[name].sha != head_files[name]:
                # Modified file
                old_blob = Blob.read(head_files[name], repo_root)
                new_blob = Blob.read(index.entries[name].sha, repo_root)

                if is_binary(old_blob.data) or is_binary(new_blob.data):
                    output.append(f"Binary files a/{name} and b/{name} differ\n")
                else:
                    old_lines = old_blob.data.decode('utf-8', errors='replace').split('\n')
                    new_lines = new_blob.data.decode('utf-8', errors='replace').split('\n')
                    if old_lines and old_lines[-1] == '':
                        old_lines = old_lines[:-1]
                    if new_lines and new_lines[-1] == '':
                        new_lines = new_lines[:-1]
                    diff = create_unified_diff(old_lines, new_lines, f"a/{name}", f"b/{name}")
                    if diff:
                        output.append(diff)

    print(''.join(output), end='')
    return 0


def diff_unstaged(repo_root: Path, paths: list, stat_only: bool) -> int:
    """Show unstaged changes (working tree vs index)."""
    index = Index.read(repo_root)
    output = []

    for name, entry in sorted(index.entries.items()):
        if paths and not matches_path(name, paths):
            continue

        file_path = repo_root / name
        if not file_path.exists():
            # File deleted
            blob = Blob.read(entry.sha, repo_root)
            old_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if old_lines and old_lines[-1] == '':
                old_lines = old_lines[:-1]
            diff = create_unified_diff(old_lines, [], f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)
        else:
            # Compare to index
            if file_path.is_symlink():
                work_content = os.readlink(file_path).encode()
            else:
                work_content = file_path.read_bytes()

            work_blob = Blob(work_content)
            if work_blob.sha != entry.sha:
                index_blob = Blob.read(entry.sha, repo_root)

                if is_binary(index_blob.data) or is_binary(work_content):
                    output.append(f"Binary files a/{name} and b/{name} differ\n")
                else:
                    old_lines = index_blob.data.decode('utf-8', errors='replace').split('\n')
                    new_lines = work_content.decode('utf-8', errors='replace').split('\n')
                    if old_lines and old_lines[-1] == '':
                        old_lines = old_lines[:-1]
                    if new_lines and new_lines[-1] == '':
                        new_lines = new_lines[:-1]
                    diff = create_unified_diff(old_lines, new_lines, f"a/{name}", f"b/{name}")
                    if diff:
                        output.append(diff)

    print(''.join(output), end='')
    return 0


def diff_commits(repo_root: Path, sha1: str, sha2: str, paths: list, stat_only: bool) -> int:
    """Show diff between two commits."""
    commit1 = Commit.read(sha1, repo_root)
    commit2 = Commit.read(sha2, repo_root)

    files1 = get_tree_files(repo_root, commit1.tree_sha)
    files2 = get_tree_files(repo_root, commit2.tree_sha)

    output = []
    all_files = set(files1.keys()) | set(files2.keys())

    for name in sorted(all_files):
        if paths and not matches_path(name, paths):
            continue

        sha_a = files1.get(name)
        sha_b = files2.get(name)

        if sha_a == sha_b:
            continue

        if sha_a and not sha_b:
            # Deleted
            blob = Blob.read(sha_a, repo_root)
            old_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if old_lines and old_lines[-1] == '':
                old_lines = old_lines[:-1]
            diff = create_unified_diff(old_lines, [], f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)
        elif sha_b and not sha_a:
            # Added
            blob = Blob.read(sha_b, repo_root)
            new_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if new_lines and new_lines[-1] == '':
                new_lines = new_lines[:-1]
            diff = create_unified_diff([], new_lines, f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)
        else:
            # Modified
            old_blob = Blob.read(sha_a, repo_root)
            new_blob = Blob.read(sha_b, repo_root)

            if is_binary(old_blob.data) or is_binary(new_blob.data):
                output.append(f"Binary files a/{name} and b/{name} differ\n")
            else:
                old_lines = old_blob.data.decode('utf-8', errors='replace').split('\n')
                new_lines = new_blob.data.decode('utf-8', errors='replace').split('\n')
                if old_lines and old_lines[-1] == '':
                    old_lines = old_lines[:-1]
                if new_lines and new_lines[-1] == '':
                    new_lines = new_lines[:-1]
                diff = create_unified_diff(old_lines, new_lines, f"a/{name}", f"b/{name}")
                if diff:
                    output.append(diff)

    print(''.join(output), end='')
    return 0


def diff_commit_worktree(repo_root: Path, sha: str, paths: list, stat_only: bool) -> int:
    """Show diff between commit and working tree."""
    commit = Commit.read(sha, repo_root)
    commit_files = get_tree_files(repo_root, commit.tree_sha)

    # Get working tree files
    work_files = {}
    for item in repo_root.rglob('*'):
        if item.is_file() and '.minigit' not in item.parts:
            try:
                rel_path = str(item.relative_to(repo_root)).replace(os.sep, '/')
                if item.is_symlink():
                    content = os.readlink(item).encode()
                else:
                    content = item.read_bytes()
                blob = Blob(content)
                work_files[rel_path] = (blob.sha, content)
            except:
                pass

    output = []
    all_files = set(commit_files.keys()) | set(work_files.keys())

    for name in sorted(all_files):
        if paths and not matches_path(name, paths):
            continue

        commit_sha = commit_files.get(name)
        work_data = work_files.get(name)

        if commit_sha and not work_data:
            # Deleted
            blob = Blob.read(commit_sha, repo_root)
            old_lines = blob.data.decode('utf-8', errors='replace').split('\n')
            if old_lines and old_lines[-1] == '':
                old_lines = old_lines[:-1]
            diff = create_unified_diff(old_lines, [], f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)
        elif work_data and not commit_sha:
            # Added
            content = work_data[1]
            new_lines = content.decode('utf-8', errors='replace').split('\n')
            if new_lines and new_lines[-1] == '':
                new_lines = new_lines[:-1]
            diff = create_unified_diff([], new_lines, f"a/{name}", f"b/{name}")
            if diff:
                output.append(diff)
        elif commit_sha != work_data[0]:
            # Modified
            old_blob = Blob.read(commit_sha, repo_root)
            new_content = work_data[1]

            if is_binary(old_blob.data) or is_binary(new_content):
                output.append(f"Binary files a/{name} and b/{name} differ\n")
            else:
                old_lines = old_blob.data.decode('utf-8', errors='replace').split('\n')
                new_lines = new_content.decode('utf-8', errors='replace').split('\n')
                if old_lines and old_lines[-1] == '':
                    old_lines = old_lines[:-1]
                if new_lines and new_lines[-1] == '':
                    new_lines = new_lines[:-1]
                diff = create_unified_diff(old_lines, new_lines, f"a/{name}", f"b/{name}")
                if diff:
                    output.append(diff)

    print(''.join(output), end='')
    return 0


def get_tree_files(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Recursively get all files from a tree."""
    files = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            files.update(get_tree_files(repo_root, entry.sha, full_path + '/'))
        else:
            files[full_path] = entry.sha

    return files


def is_binary(data: bytes) -> bool:
    """Check if data appears to be binary."""
    # Check for null bytes in first 8000 bytes
    sample = data[:8000]
    return b'\x00' in sample


def matches_path(name: str, paths: list) -> bool:
    """Check if name matches any of the paths."""
    for p in paths:
        if name == p or name.startswith(p + '/') or p == '.':
            return True
    return False
