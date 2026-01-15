"""ls-tree command - List tree contents."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """List tree contents."""
    from utils import find_repo_root
    from refs import resolve_ref
    from objects import read_commit, read_tree

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    recursive = False
    name_only = False
    target = None

    for arg in args:
        if arg == '-r':
            recursive = True
        elif arg == '--name-only':
            name_only = True
        elif not arg.startswith('-'):
            target = arg

    if target is None:
        print("error: tree-ish required", file=sys.stderr)
        return 1

    # Resolve to tree SHA
    sha = resolve_ref(repo_root, target)
    if sha is None:
        print(f"error: not a valid object name '{target}'", file=sys.stderr)
        return 1

    # If it's a commit, get its tree
    from utils import read_object
    try:
        obj_type, _ = read_object(repo_root, sha)
        if obj_type == 'commit':
            commit = read_commit(repo_root, sha)
            tree_sha = commit['tree']
        elif obj_type == 'tree':
            tree_sha = sha
        else:
            print(f"error: not a tree object", file=sys.stderr)
            return 1
    except:
        print(f"error: object '{sha}' not found", file=sys.stderr)
        return 1

    # List tree
    list_tree(repo_root, tree_sha, '', recursive, name_only)
    return 0


def list_tree(repo_root, tree_sha: str, prefix: str, recursive: bool, name_only: bool):
    """List tree contents recursively."""
    from objects import read_tree

    entries = read_tree(repo_root, tree_sha)

    for entry in entries:
        path = f"{prefix}{entry.name}" if prefix else entry.name
        type_name = 'tree' if entry.mode == '40000' else 'blob'

        if entry.mode == '40000' and recursive:
            # Recurse into subtree
            list_tree(repo_root, entry.sha, path + '/', recursive, name_only)
        else:
            if name_only:
                print(path)
            else:
                print(f"{entry.mode} {type_name} {entry.sha}\t{path}")
