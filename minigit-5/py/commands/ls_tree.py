"""ls-tree command - List tree contents."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Tree, Commit
from refs import resolve_revision


def run(args: list[str]) -> int:
    """List tree contents."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    recursive = False
    name_only = False
    tree_ish = None

    for arg in args:
        if arg == '-r':
            recursive = True
        elif arg == '--name-only':
            name_only = True
        elif not arg.startswith('-'):
            tree_ish = arg

    if tree_ish is None:
        tree_ish = 'HEAD'

    # Resolve to tree SHA
    sha = resolve_revision(repo_root, tree_ish)
    if sha is None:
        print(f"fatal: not a valid object name: {tree_ish}", file=sys.stderr)
        return 1

    # If it's a commit, get its tree
    from utils import read_object
    obj_type, _ = read_object(sha, repo_root)
    if obj_type == 'commit':
        commit = Commit.read(sha, repo_root)
        tree_sha = commit.tree_sha
    else:
        tree_sha = sha

    list_tree(repo_root, tree_sha, '', recursive, name_only)
    return 0


def list_tree(repo_root: Path, tree_sha: str, prefix: str, recursive: bool, name_only: bool):
    """List contents of a tree."""
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name

        if entry.mode == 0o40000:
            # Directory/subtree
            if name_only:
                if not recursive:
                    print(full_path)
            else:
                if not recursive:
                    print(f"{entry.mode:06o} tree {entry.sha}\t{full_path}")

            if recursive:
                list_tree(repo_root, entry.sha, full_path + '/', recursive, name_only)
        else:
            # File
            if name_only:
                print(full_path)
            else:
                print(f"{entry.mode:06o} blob {entry.sha}\t{full_path}")
