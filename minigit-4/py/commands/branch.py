"""branch command - List, create, or delete branches."""

import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import read_object, Commit, resolve_object
from refs import (
    list_branches, get_current_branch, create_branch, delete_branch,
    rename_branch, get_ref, is_branch_merged, resolve_head
)


def validate_branch_name(name: str) -> bool:
    """Check if branch name is valid."""
    if not name:
        return False
    if name.startswith('-'):
        return False
    if ' ' in name:
        return False
    if '..' in name:
        return False
    if name.startswith('.') or name.endswith('.'):
        return False
    if '@{' in name:
        return False
    # Check for invalid characters
    invalid_chars = ['~', '^', ':', '\\', '?', '*', '[']
    for c in invalid_chars:
        if c in name:
            return False
    return True


def run(args):
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
    old_name = None
    new_name = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-d':
            delete = True
        elif arg == '-D':
            force_delete = True
            delete = True
        elif arg == '-m':
            rename = True
        elif arg == '-v':
            verbose = True
        elif not arg.startswith('-'):
            if rename:
                if old_name is None:
                    old_name = arg
                else:
                    new_name = arg
            elif delete:
                branch_name = arg
            elif branch_name is None:
                branch_name = arg
            else:
                start_point = arg
        i += 1

    # Handle rename
    if rename:
        if not old_name or not new_name:
            print("error: branch rename requires old and new names", file=sys.stderr)
            return 1

        if not validate_branch_name(new_name):
            print(f"fatal: '{new_name}' is not a valid branch name", file=sys.stderr)
            return 1

        if rename_branch(old_name, new_name, repo_root):
            return 0
        else:
            print(f"error: failed to rename branch '{old_name}'", file=sys.stderr)
            return 1

    # Handle delete
    if delete:
        if not branch_name:
            print("error: branch name required", file=sys.stderr)
            return 1

        current = get_current_branch(repo_root)
        if branch_name == current:
            print(f"error: Cannot delete branch '{branch_name}' checked out", file=sys.stderr)
            return 1

        # Check if branch exists
        if get_ref(f'refs/heads/{branch_name}', repo_root) is None:
            print(f"error: branch '{branch_name}' not found", file=sys.stderr)
            return 1

        # Check if merged (unless force delete)
        if not force_delete:
            if current and not is_branch_merged(branch_name, current, repo_root):
                print(f"error: branch '{branch_name}' is not fully merged", file=sys.stderr)
                print("If you are sure you want to delete it, run 'minigit branch -D {}'".format(branch_name), file=sys.stderr)
                return 1

        if delete_branch(branch_name, repo_root):
            print(f"Deleted branch {branch_name}")
            return 0
        else:
            print(f"error: failed to delete branch '{branch_name}'", file=sys.stderr)
            return 1

    # Handle create
    if branch_name:
        if not validate_branch_name(branch_name):
            print(f"fatal: '{branch_name}' is not a valid branch name", file=sys.stderr)
            return 1

        # Get start point
        if start_point:
            try:
                sha = resolve_object(start_point, repo_root)
            except ValueError as e:
                print(f"fatal: {e}", file=sys.stderr)
                return 1
        else:
            sha = resolve_head(repo_root)
            if not sha:
                print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
                return 1

        if create_branch(branch_name, sha, repo_root):
            return 0
        else:
            print(f"fatal: branch '{branch_name}' already exists", file=sys.stderr)
            return 1

    # List branches
    branches = list_branches(repo_root)
    current = get_current_branch(repo_root)

    for branch in branches:
        if branch == current:
            prefix = '* '
        else:
            prefix = '  '

        if verbose:
            sha = get_ref(f'refs/heads/{branch}', repo_root)
            if sha:
                try:
                    _, data = read_object(sha, repo_root)
                    commit = Commit.deserialize(data)
                    msg = commit.message.split('\n')[0][:50]
                    print(f'{prefix}{branch} {sha[:7]} {msg}')
                except:
                    print(f'{prefix}{branch} {sha[:7]}')
            else:
                print(f'{prefix}{branch}')
        else:
            print(f'{prefix}{branch}')

    return 0
