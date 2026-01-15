"""branch command - List, create, or delete branches."""

import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Commit
from refs import (
    list_branches, get_current_branch, read_ref, write_ref, delete_ref,
    resolve_revision
)


def run(args: list[str]) -> int:
    """Manage branches."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    delete = False
    force_delete = False
    rename = False
    verbose = False
    branch_name = None
    start_point = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-d':
            delete = True
        elif arg == '-D':
            force_delete = True
        elif arg == '-m':
            rename = True
        elif arg == '-v':
            verbose = True
        elif not arg.startswith('-'):
            if branch_name is None:
                branch_name = arg
            else:
                start_point = arg
        i += 1

    if delete or force_delete:
        if not branch_name:
            print("fatal: branch name required", file=sys.stderr)
            return 1
        return delete_branch(repo_root, branch_name, force_delete)

    if rename:
        if not branch_name or not start_point:
            print("fatal: rename requires old and new names", file=sys.stderr)
            return 1
        return rename_branch(repo_root, branch_name, start_point)

    if branch_name:
        return create_branch(repo_root, branch_name, start_point)

    return list_branches_cmd(repo_root, verbose)


def list_branches_cmd(repo_root: Path, verbose: bool) -> int:
    """List all branches."""
    branches = list_branches(repo_root)
    current = get_current_branch(repo_root)

    for branch in branches:
        if branch == current:
            prefix = '* '
        else:
            prefix = '  '

        if verbose:
            sha = read_ref(repo_root, f'refs/heads/{branch}')
            if sha:
                try:
                    commit = Commit.read(sha, repo_root)
                    message = commit.message.split('\n')[0]
                    print(f"{prefix}{branch} {sha[:7]} {message}")
                except:
                    print(f"{prefix}{branch} {sha[:7]}")
            else:
                print(f"{prefix}{branch}")
        else:
            print(f"{prefix}{branch}")

    return 0


def create_branch(repo_root: Path, name: str, start_point: str = None) -> int:
    """Create a new branch."""
    # Validate branch name
    if not is_valid_branch_name(name):
        print(f"fatal: invalid branch name: {name}", file=sys.stderr)
        return 1

    # Check if branch already exists
    if read_ref(repo_root, f'refs/heads/{name}'):
        print(f"fatal: a branch named '{name}' already exists", file=sys.stderr)
        return 1

    # Get starting point SHA
    if start_point:
        sha = resolve_revision(repo_root, start_point)
        if sha is None:
            print(f"fatal: not a valid object name: '{start_point}'", file=sys.stderr)
            return 1
    else:
        from refs import resolve_head
        sha = resolve_head(repo_root)
        if sha is None:
            print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
            return 1

    # Create the branch
    write_ref(repo_root, f'refs/heads/{name}', sha)
    return 0


def delete_branch(repo_root: Path, name: str, force: bool) -> int:
    """Delete a branch."""
    current = get_current_branch(repo_root)

    if name == current:
        print(f"error: cannot delete branch '{name}' used by worktree", file=sys.stderr)
        return 1

    ref_path = f'refs/heads/{name}'
    if not read_ref(repo_root, ref_path):
        print(f"error: branch '{name}' not found", file=sys.stderr)
        return 1

    if not force:
        # Check if branch is merged
        from refs import resolve_head
        head_sha = resolve_head(repo_root)
        branch_sha = read_ref(repo_root, ref_path)

        if head_sha and branch_sha and not is_ancestor(repo_root, branch_sha, head_sha):
            print(f"error: branch '{name}' is not fully merged", file=sys.stderr)
            print(f"If you are sure you want to delete it, run 'branch -D {name}'", file=sys.stderr)
            return 1

    delete_ref(repo_root, ref_path)
    print(f"Deleted branch {name}")
    return 0


def rename_branch(repo_root: Path, old_name: str, new_name: str) -> int:
    """Rename a branch."""
    if not is_valid_branch_name(new_name):
        print(f"fatal: invalid branch name: {new_name}", file=sys.stderr)
        return 1

    old_ref = f'refs/heads/{old_name}'
    new_ref = f'refs/heads/{new_name}'

    sha = read_ref(repo_root, old_ref)
    if not sha:
        print(f"error: branch '{old_name}' not found", file=sys.stderr)
        return 1

    if read_ref(repo_root, new_ref):
        print(f"fatal: a branch named '{new_name}' already exists", file=sys.stderr)
        return 1

    # Create new ref and delete old
    write_ref(repo_root, new_ref, sha)
    delete_ref(repo_root, old_ref)

    # Update HEAD if it was pointing to old branch
    current = get_current_branch(repo_root)
    if current == old_name:
        from refs import write_head
        write_head(repo_root, f'ref: refs/heads/{new_name}')

    return 0


def is_valid_branch_name(name: str) -> bool:
    """Check if branch name is valid."""
    if not name:
        return False
    if name.startswith('-'):
        return False
    if ' ' in name:
        return False
    if '..' in name:
        return False
    if name.startswith('.'):
        return False
    if name.endswith('/'):
        return False
    if name.endswith('.lock'):
        return False
    if '@{' in name:
        return False
    # Check for invalid characters
    invalid_chars = ['~', '^', ':', '\\', '*', '?', '[']
    for char in invalid_chars:
        if char in name:
            return False
    return True


def is_ancestor(repo_root: Path, commit1: str, commit2: str) -> bool:
    """Check if commit1 is an ancestor of commit2."""
    visited = set()
    queue = [commit2]

    while queue:
        sha = queue.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        if sha == commit1:
            return True

        try:
            commit = Commit.read(sha, repo_root)
            queue.extend(commit.parents)
        except:
            pass

    return False
