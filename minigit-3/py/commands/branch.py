"""branch command - Manage branches."""

import sys
from pathlib import Path
import re


def run(args: list[str]) -> int:
    """List, create, or delete branches."""
    from utils import find_repo_root
    from refs import (list_branches, get_current_branch, read_ref, write_ref,
                     delete_ref, resolve_ref, get_head_sha)
    from objects import read_commit

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
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
            if i + 1 < len(args):
                branch_name = args[i + 1]
                i += 1
        elif arg == '-D':
            force_delete = True
            delete = True
            if i + 1 < len(args):
                branch_name = args[i + 1]
                i += 1
        elif arg == '-m':
            rename = True
            if i + 2 < len(args):
                old_name = args[i + 1]
                new_name = args[i + 2]
                i += 2
        elif arg == '-v':
            verbose = True
        elif not arg.startswith('-'):
            if branch_name is None:
                branch_name = arg
            else:
                start_point = arg
        i += 1

    # Validate branch name
    def is_valid_branch_name(name: str) -> bool:
        if not name:
            return False
        if name.startswith('-'):
            return False
        if ' ' in name:
            return False
        if name.startswith('.'):
            return False
        if '..' in name:
            return False
        if name.endswith('/'):
            return False
        if name.endswith('.lock'):
            return False
        # Check for invalid characters
        invalid_chars = ['~', '^', ':', '\\', '*', '?', '[']
        for char in invalid_chars:
            if char in name:
                return False
        return True

    # Handle rename
    if rename:
        if not old_name or not new_name:
            print("error: branch -m requires two arguments", file=sys.stderr)
            return 1

        if not is_valid_branch_name(new_name):
            print(f"error: '{new_name}' is not a valid branch name", file=sys.stderr)
            return 1

        old_sha = read_ref(repo_root, f'refs/heads/{old_name}')
        if not old_sha:
            print(f"error: branch '{old_name}' not found", file=sys.stderr)
            return 1

        existing = read_ref(repo_root, f'refs/heads/{new_name}')
        if existing:
            print(f"error: branch '{new_name}' already exists", file=sys.stderr)
            return 1

        write_ref(repo_root, f'refs/heads/{new_name}', old_sha)
        delete_ref(repo_root, f'refs/heads/{old_name}')

        # Update HEAD if we renamed the current branch
        current = get_current_branch(repo_root)
        if current == old_name:
            from refs import write_head
            write_head(repo_root, f'ref: refs/heads/{new_name}')

        return 0

    # Handle delete
    if delete:
        if not branch_name:
            print("error: branch name required", file=sys.stderr)
            return 1

        current = get_current_branch(repo_root)
        if current == branch_name:
            print(f"error: cannot delete branch '{branch_name}' checked out", file=sys.stderr)
            return 1

        sha = read_ref(repo_root, f'refs/heads/{branch_name}')
        if not sha:
            print(f"error: branch '{branch_name}' not found", file=sys.stderr)
            return 1

        # Check if merged (unless force delete)
        if not force_delete:
            head_sha = get_head_sha(repo_root)
            if head_sha:
                # Check if branch is reachable from HEAD
                # For simplicity, we'll allow deletion always with -d
                # A full implementation would check merge status
                pass

        delete_ref(repo_root, f'refs/heads/{branch_name}')
        print(f"Deleted branch {branch_name}")
        return 0

    # Handle create
    if branch_name:
        if not is_valid_branch_name(branch_name):
            print(f"error: '{branch_name}' is not a valid branch name", file=sys.stderr)
            return 1

        existing = read_ref(repo_root, f'refs/heads/{branch_name}')
        if existing:
            print(f"error: branch '{branch_name}' already exists", file=sys.stderr)
            return 1

        if start_point:
            sha = resolve_ref(repo_root, start_point)
            if not sha:
                print(f"error: not a valid revision: '{start_point}'", file=sys.stderr)
                return 1
        else:
            sha = get_head_sha(repo_root)
            if not sha:
                print("error: no commits yet", file=sys.stderr)
                return 1

        write_ref(repo_root, f'refs/heads/{branch_name}', sha)
        return 0

    # Handle list
    branches = list_branches(repo_root)
    current = get_current_branch(repo_root)

    for branch in sorted(branches):
        if branch == current:
            prefix = '* '
        else:
            prefix = '  '

        if verbose:
            sha = read_ref(repo_root, f'refs/heads/{branch}')
            try:
                commit = read_commit(repo_root, sha)
                msg = commit['message'].split('\n')[0]
                print(f"{prefix}{branch} {sha[:7]} {msg}")
            except:
                print(f"{prefix}{branch}")
        else:
            print(f"{prefix}{branch}")

    return 0
