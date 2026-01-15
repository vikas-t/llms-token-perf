"""cat-file command - Examine object internals."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import read_object, Commit, Tree, Tag, resolve_object


def run(args):
    """Examine git objects."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    show_type = False
    show_size = False
    pretty = False
    obj_type = None
    target = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-t':
            show_type = True
        elif arg == '-s':
            show_size = True
        elif arg == '-p':
            pretty = True
        elif arg in ('blob', 'tree', 'commit', 'tag'):
            obj_type = arg
            if i + 1 < len(args):
                target = args[i + 1]
                i += 1
        elif not arg.startswith('-'):
            target = arg
        i += 1

    if not target:
        print("fatal: no object specified", file=sys.stderr)
        return 1

    # Resolve object
    try:
        sha = resolve_object(target, repo_root)
    except ValueError as e:
        print(f"fatal: Not a valid object name {target}", file=sys.stderr)
        return 1

    try:
        actual_type, data = read_object(sha, repo_root)
    except ValueError as e:
        print(f"fatal: Not a valid object name {target}", file=sys.stderr)
        return 1

    if show_type:
        print(actual_type)
        return 0

    if show_size:
        print(len(data))
        return 0

    if obj_type:
        # Raw output of specific type
        if actual_type != obj_type:
            print(f"fatal: object {sha} is {actual_type}, not {obj_type}", file=sys.stderr)
            return 1
        sys.stdout.buffer.write(data)
        return 0

    if pretty:
        if actual_type == 'blob':
            sys.stdout.buffer.write(data)
        elif actual_type == 'tree':
            tree = Tree.deserialize(data)
            for entry in tree.entries:
                if entry.mode.startswith('40'):
                    entry_type = 'tree'
                else:
                    entry_type = 'blob'
                print(f'{entry.mode} {entry_type} {entry.sha}\t{entry.name}')
        elif actual_type == 'commit':
            commit = Commit.deserialize(data)
            print(f'tree {commit.tree_sha}')
            for parent in commit.parents:
                print(f'parent {parent}')
            print(f'author {commit.author}')
            print(f'committer {commit.committer}')
            print()
            print(commit.message)
        elif actual_type == 'tag':
            tag = Tag.deserialize(data)
            print(f'object {tag.object_sha}')
            print(f'type {tag.object_type}')
            print(f'tag {tag.tag_name}')
            print(f'tagger {tag.tagger}')
            print()
            print(tag.message)
        else:
            print(f"Unknown object type: {actual_type}", file=sys.stderr)
            return 1
        return 0

    # Default: raw output
    sys.stdout.buffer.write(data)
    return 0
