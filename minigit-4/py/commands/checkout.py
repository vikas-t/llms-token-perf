"""checkout command - Switch branches or restore files."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from objects import read_object, Commit, Tree, resolve_object, hash_object
from index import Index, IndexEntry
from refs import (
    set_head, create_branch, get_ref, get_current_branch,
    resolve_head
)


def get_tree_files(tree_sha: str, repo_root: Path) -> dict:
    """Get all files from a tree as {path: (mode, sha)}."""
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
                    files[path] = (entry.mode, entry.sha)
        except:
            pass

    walk_tree(tree_sha, '')
    return files


def run(args):
    """Switch branches or restore files."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    create_new = False
    target = None
    files = []
    separator_seen = False
    start_point = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-b':
            create_new = True
        elif arg == '--':
            separator_seen = True
        elif separator_seen:
            files.append(arg)
        elif not arg.startswith('-'):
            if target is None:
                target = arg
            elif create_new and start_point is None:
                start_point = arg
            else:
                files.append(arg)
        i += 1

    if not target and not files:
        print("error: no target specified", file=sys.stderr)
        return 1

    # Handle file restore (checkout -- <files>)
    if files or separator_seen:
        return checkout_files(repo_root, target, files)

    # Handle branch checkout
    return checkout_ref(repo_root, target, create_new, start_point)


def checkout_files(repo_root: Path, source: str, files: list) -> int:
    """Restore files from index or commit."""
    index = Index.read(repo_root)

    if source:
        # Restore from specific commit
        try:
            sha = resolve_object(source, repo_root)
            _, data = read_object(sha, repo_root)
            commit = Commit.deserialize(data)
            tree_files = get_tree_files(commit.tree_sha, repo_root)
        except ValueError as e:
            print(f"fatal: {e}", file=sys.stderr)
            return 1
    else:
        # Restore from index
        tree_files = None

    for name in files:
        file_path = repo_root / name

        if tree_files is not None:
            # Restore from commit
            if name not in tree_files:
                print(f"error: pathspec '{name}' did not match any file(s)", file=sys.stderr)
                return 1

            mode, blob_sha = tree_files[name]
            _, content = read_object(blob_sha, repo_root)

            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)

            # Update index
            entry = IndexEntry.from_file(file_path, blob_sha, repo_root)
            index.add_entry(entry)
        else:
            # Restore from index
            if name not in index.entries:
                print(f"error: pathspec '{name}' did not match any file(s)", file=sys.stderr)
                return 1

            entry = index.entries[name]
            _, content = read_object(entry.sha, repo_root)

            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)

    index.write(repo_root)
    return 0


def checkout_ref(repo_root: Path, target: str, create_new: bool, start_point: str) -> int:
    """Checkout a branch or commit."""
    index = Index.read(repo_root)

    # Get current state
    current_head = resolve_head(repo_root)
    if current_head:
        _, data = read_object(current_head, repo_root)
        current_commit = Commit.deserialize(data)
        current_files = get_tree_files(current_commit.tree_sha, repo_root)
    else:
        current_files = {}

    # Resolve target
    if create_new:
        # Create new branch
        if start_point:
            try:
                sha = resolve_object(start_point, repo_root)
            except ValueError as e:
                print(f"fatal: {e}", file=sys.stderr)
                return 1
        else:
            sha = current_head
            if not sha:
                print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
                return 1

        if not create_branch(target, sha, repo_root):
            print(f"fatal: branch '{target}' already exists", file=sys.stderr)
            return 1

        set_head(f'refs/heads/{target}', symbolic=True, repo_root=repo_root)

        # Update working tree
        if sha != current_head:
            return update_worktree(repo_root, current_files, sha, index)

        return 0

    # Check if target is a branch
    branch_sha = get_ref(f'refs/heads/{target}', repo_root)
    is_branch = branch_sha is not None

    try:
        if is_branch:
            target_sha = branch_sha
        else:
            target_sha = resolve_object(target, repo_root)
    except ValueError as e:
        print(f"error: pathspec '{target}' did not match any file(s) known to minigit", file=sys.stderr)
        return 1

    # Check for uncommitted changes that would be overwritten
    _, target_data = read_object(target_sha, repo_root)
    target_commit = Commit.deserialize(target_data)
    target_files = get_tree_files(target_commit.tree_sha, repo_root)

    # Check for conflicts
    for name, (mode, sha) in target_files.items():
        if name in current_files:
            current_mode, current_sha = current_files[name]
            if current_sha != sha:
                # File differs - check working tree
                file_path = repo_root / name
                if file_path.exists():
                    try:
                        if file_path.is_symlink():
                            content = os.readlink(file_path).encode()
                        else:
                            content = file_path.read_bytes()
                        worktree_sha = hash_object(content, 'blob')
                        if worktree_sha != current_sha:
                            # Working tree has changes that would be overwritten
                            print(f"error: Your local changes to the following files would be overwritten by checkout:", file=sys.stderr)
                            print(f"\t{name}", file=sys.stderr)
                            print("Please commit your changes or stash them before you switch branches.", file=sys.stderr)
                            return 1
                    except:
                        pass

    # Update HEAD
    if is_branch:
        set_head(f'refs/heads/{target}', symbolic=True, repo_root=repo_root)
        branch_msg = f"Switched to branch '{target}'"
    else:
        set_head(target_sha, symbolic=False, repo_root=repo_root)
        branch_msg = f"HEAD is now at {target_sha[:7]}"

    # Update working tree
    result = update_worktree(repo_root, current_files, target_sha, index)
    if result == 0:
        print(branch_msg)
    return result


def update_worktree(repo_root: Path, current_files: dict, target_sha: str, index: Index) -> int:
    """Update working tree to match target commit."""
    _, target_data = read_object(target_sha, repo_root)
    target_commit = Commit.deserialize(target_data)
    target_files = get_tree_files(target_commit.tree_sha, repo_root)

    # Remove files not in target
    for name in current_files:
        if name not in target_files:
            file_path = repo_root / name
            if file_path.exists():
                file_path.unlink()
                # Remove empty directories
                try:
                    parent = file_path.parent
                    while parent != repo_root:
                        if not any(parent.iterdir()):
                            parent.rmdir()
                        parent = parent.parent
                except:
                    pass
            # Remove from index
            index.remove_entry(name)

    # Add/update files in target
    for name, (mode, sha) in target_files.items():
        file_path = repo_root / name
        _, content = read_object(sha, repo_root)

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(content)

        # Set executable bit if needed
        if mode == '100755':
            os.chmod(file_path, 0o755)

        # Update index
        entry = IndexEntry.from_file(file_path, sha, repo_root)
        index.add_entry(entry)

    index.write(repo_root)
    return 0
