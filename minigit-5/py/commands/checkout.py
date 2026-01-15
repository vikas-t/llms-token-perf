"""checkout command - Switch branches or restore files."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Blob, Tree, Commit
from index import Index, IndexEntry, create_entry_from_file
from refs import (
    resolve_revision, resolve_head, read_ref, write_head, write_ref,
    get_current_branch, get_head_ref
)


def run(args: list[str]) -> int:
    """Switch branches or restore files."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    create_branch = False
    paths = []
    target = None
    commit_for_files = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-b':
            create_branch = True
        elif arg == '--':
            paths.extend(args[i + 1:])
            break
        elif target is None:
            target = arg
        elif commit_for_files is None:
            # This could be start-point for -b or commit for -- <paths>
            commit_for_files = arg
        else:
            paths.append(arg)
        i += 1

    if paths:
        # Restore files mode
        if target and commit_for_files is None:
            # checkout <commit> -- <paths>
            # target is the commit, paths are the files
            return restore_files_from_commit(repo_root, target, paths)
        elif target:
            # checkout -- <paths> - restore from index
            # target is actually the first path
            return restore_files_from_index(repo_root, [target] + paths)
        else:
            return restore_files_from_index(repo_root, paths)

    if create_branch:
        if not target:
            print("fatal: branch name required", file=sys.stderr)
            return 1
        return create_and_checkout(repo_root, target, commit_for_files)

    if target:
        return checkout_target(repo_root, target)

    print("fatal: no target specified", file=sys.stderr)
    return 1


def checkout_target(repo_root: Path, target: str) -> int:
    """Checkout a branch or commit."""
    # Check if it's a branch
    branch_sha = read_ref(repo_root, f'refs/heads/{target}')

    if branch_sha:
        # Checkout branch
        return checkout_branch(repo_root, target, branch_sha)
    else:
        # Try as commit SHA
        sha = resolve_revision(repo_root, target)
        if sha:
            return checkout_detached(repo_root, sha)
        else:
            print(f"error: pathspec '{target}' did not match any branch or commit", file=sys.stderr)
            return 1


def checkout_branch(repo_root: Path, branch: str, sha: str) -> int:
    """Switch to a branch."""
    current_sha = resolve_head(repo_root)

    if sha != current_sha:
        # Check for uncommitted changes that would be overwritten
        if has_conflicting_changes(repo_root, sha):
            print("error: your local changes would be overwritten by checkout", file=sys.stderr)
            return 1

        # Update working tree
        update_working_tree(repo_root, sha)

    # Update HEAD to point to branch
    write_head(repo_root, f'ref: refs/heads/{branch}')

    print(f"Switched to branch '{branch}'")
    return 0


def checkout_detached(repo_root: Path, sha: str) -> int:
    """Checkout a specific commit (detached HEAD)."""
    current_sha = resolve_head(repo_root)

    if sha != current_sha:
        if has_conflicting_changes(repo_root, sha):
            print("error: your local changes would be overwritten by checkout", file=sys.stderr)
            return 1

        update_working_tree(repo_root, sha)

    # Set HEAD directly to SHA
    write_head(repo_root, sha)

    print(f"Note: checking out '{sha[:7]}'.")
    print("You are in 'detached HEAD' state.")
    return 0


def create_and_checkout(repo_root: Path, branch: str, start_point: str = None) -> int:
    """Create a new branch and switch to it."""
    from commands.branch import is_valid_branch_name

    if not is_valid_branch_name(branch):
        print(f"fatal: invalid branch name: {branch}", file=sys.stderr)
        return 1

    if read_ref(repo_root, f'refs/heads/{branch}'):
        print(f"fatal: a branch named '{branch}' already exists", file=sys.stderr)
        return 1

    # Get starting point
    if start_point:
        sha = resolve_revision(repo_root, start_point)
        if sha is None:
            print(f"fatal: not a valid object name: '{start_point}'", file=sys.stderr)
            return 1
    else:
        sha = resolve_head(repo_root)
        if sha is None:
            print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
            return 1

    current_sha = resolve_head(repo_root)
    if sha != current_sha:
        if has_conflicting_changes(repo_root, sha):
            print("error: your local changes would be overwritten by checkout", file=sys.stderr)
            return 1
        update_working_tree(repo_root, sha)

    # Create branch ref
    write_ref(repo_root, f'refs/heads/{branch}', sha)

    # Update HEAD
    write_head(repo_root, f'ref: refs/heads/{branch}')

    print(f"Switched to a new branch '{branch}'")
    return 0


def restore_files_from_index(repo_root: Path, paths: list) -> int:
    """Restore files from index."""
    index = Index.read(repo_root)

    for path in paths:
        path = path.replace(os.sep, '/')
        if path in index.entries:
            entry = index.entries[path]
            restore_file(repo_root, path, entry.sha)
        else:
            print(f"error: pathspec '{path}' did not match any file(s) known to git", file=sys.stderr)

    return 0


def restore_files_from_commit(repo_root: Path, commit_ref: str, paths: list) -> int:
    """Restore files from a specific commit."""
    sha = resolve_revision(repo_root, commit_ref)
    if sha is None:
        print(f"fatal: not a valid object name: '{commit_ref}'", file=sys.stderr)
        return 1

    commit = Commit.read(sha, repo_root)
    tree_files = get_tree_files(repo_root, commit.tree_sha)

    for path in paths:
        path = path.replace(os.sep, '/')
        if path in tree_files:
            restore_file(repo_root, path, tree_files[path][0])

            # Also update index
            index = Index.read(repo_root)
            file_path = repo_root / path
            mode = tree_files[path][1]
            entry = create_entry_from_file(file_path, path, tree_files[path][0], mode)
            index.add_entry(entry)
            index.write(repo_root)
        else:
            print(f"error: pathspec '{path}' did not match any file(s)", file=sys.stderr)

    return 0


def restore_file(repo_root: Path, rel_path: str, sha: str):
    """Restore a single file from blob SHA."""
    blob = Blob.read(sha, repo_root)
    file_path = repo_root / rel_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(blob.data)


def has_conflicting_changes(repo_root: Path, target_sha: str) -> bool:
    """Check if there are uncommitted changes that would conflict."""
    index = Index.read(repo_root)
    target_commit = Commit.read(target_sha, repo_root)
    target_files = get_tree_files(repo_root, target_commit.tree_sha)

    # Check each indexed file
    for name, entry in index.entries.items():
        file_path = repo_root / name

        if name in target_files:
            target_blob_sha = target_files[name][0]

            # If file is modified in working tree and target differs
            if file_path.exists():
                if file_path.is_symlink():
                    content = os.readlink(file_path).encode()
                else:
                    content = file_path.read_bytes()

                work_blob = Blob(content)

                if work_blob.sha != entry.sha and target_blob_sha != entry.sha:
                    # Working tree differs from index, and target differs from index
                    return True
        else:
            # File doesn't exist in target - check if modified
            if file_path.exists():
                if file_path.is_symlink():
                    content = os.readlink(file_path).encode()
                else:
                    content = file_path.read_bytes()
                work_blob = Blob(content)
                if work_blob.sha != entry.sha:
                    return True

    return False


def update_working_tree(repo_root: Path, target_sha: str):
    """Update working tree to match target commit."""
    index = Index.read(repo_root)
    current_files = set(index.entries.keys())

    target_commit = Commit.read(target_sha, repo_root)
    target_files = get_tree_files(repo_root, target_commit.tree_sha)

    # Remove files not in target
    for name in current_files:
        if name not in target_files:
            file_path = repo_root / name
            if file_path.exists():
                file_path.unlink()
                # Clean up empty directories
                try:
                    file_path.parent.rmdir()
                except:
                    pass
            index.remove_entry(name)

    # Add/update files from target
    for name, (sha, mode) in target_files.items():
        blob = Blob.read(sha, repo_root)
        file_path = repo_root / name
        file_path.parent.mkdir(parents=True, exist_ok=True)

        if mode == 0o120000:
            # Symlink
            if file_path.exists() or file_path.is_symlink():
                file_path.unlink()
            os.symlink(blob.data.decode(), file_path)
        else:
            file_path.write_bytes(blob.data)
            if mode == 0o100755:
                file_path.chmod(0o755)

        # Update index
        entry = create_entry_from_file(file_path, name, sha, mode)
        index.add_entry(entry)

    index.write(repo_root)


def get_tree_files(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Recursively get all files from a tree."""
    files = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            files.update(get_tree_files(repo_root, entry.sha, full_path + '/'))
        else:
            files[full_path] = (entry.sha, entry.mode)

    return files
