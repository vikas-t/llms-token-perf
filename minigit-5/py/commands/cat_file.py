"""cat-file command - Examine object internals."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, read_object
from objects import Blob, Tree, Commit, Tag
from refs import resolve_revision


def run(args: list[str]) -> int:
    """Examine object internals."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if len(args) < 2:
        print("usage: minigit cat-file (-t|-s|-p) <object>", file=sys.stderr)
        return 1

    # Parse arguments
    mode = args[0]
    obj_ref = args[1]

    # Handle positional usage: cat-file blob <sha>
    if mode in ('blob', 'tree', 'commit', 'tag'):
        expected_type = mode
        obj_ref = args[1]
        return show_raw(repo_root, obj_ref, expected_type)

    # Resolve object
    sha = resolve_revision(repo_root, obj_ref)
    if sha is None:
        print(f"fatal: not a valid object name: {obj_ref}", file=sys.stderr)
        return 1

    try:
        obj_type, data = read_object(sha, repo_root)
    except Exception as e:
        print(f"fatal: not a valid object: {sha}", file=sys.stderr)
        return 1

    if mode == '-t':
        print(obj_type)
    elif mode == '-s':
        print(len(data))
    elif mode == '-p':
        return pretty_print(repo_root, sha, obj_type, data)
    else:
        print(f"unknown option: {mode}", file=sys.stderr)
        return 1

    return 0


def show_raw(repo_root: Path, obj_ref: str, expected_type: str) -> int:
    """Show raw object content."""
    sha = resolve_revision(repo_root, obj_ref)
    if sha is None:
        print(f"fatal: not a valid object name: {obj_ref}", file=sys.stderr)
        return 1

    obj_type, data = read_object(sha, repo_root)
    if obj_type != expected_type:
        print(f"fatal: {sha} is not a {expected_type}", file=sys.stderr)
        return 1

    if expected_type == 'blob':
        try:
            print(data.decode('utf-8'), end='')
        except:
            sys.stdout.buffer.write(data)
    else:
        print(data.decode('utf-8'), end='')

    return 0


def pretty_print(repo_root: Path, sha: str, obj_type: str, data: bytes) -> int:
    """Pretty-print object content."""
    if obj_type == 'blob':
        try:
            print(data.decode('utf-8'), end='')
        except:
            sys.stdout.buffer.write(data)

    elif obj_type == 'tree':
        tree = Tree.read(sha, repo_root)
        for entry in tree.entries:
            type_name = 'tree' if entry.mode == 0o40000 else 'blob'
            print(f"{entry.mode:06o} {type_name} {entry.sha}\t{entry.name}")

    elif obj_type == 'commit':
        commit = Commit.read(sha, repo_root)
        print(f"tree {commit.tree_sha}")
        for parent in commit.parents:
            print(f"parent {parent}")
        print(f"author {commit.author} <{commit.author_email}> {commit.author_date}")
        print(f"committer {commit.committer} <{commit.committer_email}> {commit.committer_date}")
        print()
        print(commit.message)

    elif obj_type == 'tag':
        tag = Tag.read(sha, repo_root)
        print(f"object {tag.object_sha}")
        print(f"type {tag.object_type}")
        print(f"tag {tag.tag_name}")
        print(f"tagger {tag.tagger} <{tag.tagger_email}> {tag.tagger_date}")
        print()
        print(tag.message)

    return 0
