"""ls-tree command - List tree contents."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import read_object, Tree, resolve_object


def run(args):
    """List tree contents."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
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

    if not target:
        print("fatal: no tree specified", file=sys.stderr)
        return 1

    # Resolve to tree
    try:
        sha = resolve_object(target, repo_root)
    except ValueError as e:
        print(f"fatal: Not a valid object name {target}", file=sys.stderr)
        return 1

    # Get tree SHA
    obj_type, data = read_object(sha, repo_root)

    if obj_type == 'commit':
        from objects import Commit
        commit = Commit.deserialize(data)
        tree_sha = commit.tree_sha
    elif obj_type == 'tree':
        tree_sha = sha
    else:
        print(f"fatal: not a tree object", file=sys.stderr)
        return 1

    # List tree
    list_tree(tree_sha, '', repo_root, recursive, name_only)
    return 0


def list_tree(tree_sha: str, prefix: str, repo_root: Path,
              recursive: bool, name_only: bool):
    """Recursively list tree contents."""
    _, data = read_object(tree_sha, repo_root)
    tree = Tree.deserialize(data)

    for entry in tree.entries:
        path = f'{prefix}{entry.name}' if prefix else entry.name

        if entry.mode.startswith('40'):
            entry_type = 'tree'
        else:
            entry_type = 'blob'

        if name_only:
            if entry_type == 'tree' and recursive:
                # Don't print directory itself in recursive name-only mode
                pass
            else:
                print(path)
        else:
            print(f'{entry.mode} {entry_type} {entry.sha}\t{path}')

        if recursive and entry_type == 'tree':
            list_tree(entry.sha, path + '/', repo_root, recursive, name_only)
