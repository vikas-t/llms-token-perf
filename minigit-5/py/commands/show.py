"""show command - Show object content."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, read_object
from objects import Blob, Tree, Commit, Tag
from refs import resolve_revision, resolve_head
from diff_algo import create_unified_diff


def run(args: list[str]) -> int:
    """Show object content."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        target = 'HEAD'
    else:
        target = args[0]

    # Handle <commit>:<path> syntax
    if ':' in target and not target.startswith(':'):
        ref_part, path = target.split(':', 1)
        sha = resolve_revision(repo_root, f'{ref_part}:{path}')
        if sha is None:
            print(f"fatal: path '{path}' not found in '{ref_part}'", file=sys.stderr)
            return 1
        return show_blob(repo_root, sha)

    # Resolve target
    sha = resolve_revision(repo_root, target)
    if sha is None:
        print(f"fatal: ambiguous argument '{target}'", file=sys.stderr)
        return 1

    # Determine object type
    obj_type, data = read_object(sha, repo_root)

    if obj_type == 'commit':
        return show_commit(repo_root, sha)
    elif obj_type == 'tree':
        return show_tree(repo_root, sha)
    elif obj_type == 'blob':
        return show_blob(repo_root, sha)
    elif obj_type == 'tag':
        return show_tag(repo_root, sha)
    else:
        print(f"Unknown object type: {obj_type}", file=sys.stderr)
        return 1


def show_commit(repo_root: Path, sha: str) -> int:
    """Show a commit with its diff."""
    commit = Commit.read(sha, repo_root)

    print(f"commit {sha}")
    if len(commit.parents) > 1:
        print(f"Merge: {' '.join(p[:7] for p in commit.parents)}")
    print(f"Author: {commit.author} <{commit.author_email}>")
    print(f"Date:   {format_date(commit.author_date)}")
    print()

    for line in commit.message.split('\n'):
        print(f"    {line}")

    print()

    # Show diff from parent
    if commit.parents:
        parent = Commit.read(commit.parents[0], repo_root)
        show_diff_between_trees(repo_root, parent.tree_sha, commit.tree_sha)
    else:
        # Initial commit - show all files as added
        show_diff_between_trees(repo_root, None, commit.tree_sha)

    return 0


def show_tree(repo_root: Path, sha: str) -> int:
    """Show tree contents."""
    tree = Tree.read(sha, repo_root)

    for entry in tree.entries:
        type_name = 'tree' if entry.mode == 0o40000 else 'blob'
        print(f"{entry.mode:06o} {type_name} {entry.sha}\t{entry.name}")

    return 0


def show_blob(repo_root: Path, sha: str) -> int:
    """Show blob content."""
    blob = Blob.read(sha, repo_root)
    try:
        print(blob.data.decode('utf-8'), end='')
    except:
        sys.stdout.buffer.write(blob.data)
    return 0


def show_tag(repo_root: Path, sha: str) -> int:
    """Show tag information."""
    tag = Tag.read(sha, repo_root)

    print(f"tag {tag.tag_name}")
    print(f"Tagger: {tag.tagger} <{tag.tagger_email}>")
    print(f"Date:   {format_date(tag.tagger_date)}")
    print()
    print(tag.message)
    print()

    # Show the referenced object
    print(f"object {tag.object_sha}")
    print(f"type {tag.object_type}")

    return 0


def show_diff_between_trees(repo_root: Path, old_tree_sha: str, new_tree_sha: str):
    """Show unified diff between two trees."""
    old_files = get_tree_files(repo_root, old_tree_sha) if old_tree_sha else {}
    new_files = get_tree_files(repo_root, new_tree_sha)

    all_files = set(old_files.keys()) | set(new_files.keys())

    for name in sorted(all_files):
        old_sha = old_files.get(name)
        new_sha = new_files.get(name)

        if old_sha == new_sha:
            continue

        if old_sha and not new_sha:
            # Deleted
            blob = Blob.read(old_sha, repo_root)
            if is_binary(blob.data):
                print(f"Binary file {name} deleted")
            else:
                old_lines = blob.data.decode('utf-8', errors='replace').split('\n')
                if old_lines and old_lines[-1] == '':
                    old_lines = old_lines[:-1]
                diff = create_unified_diff(old_lines, [], f"a/{name}", f"b/{name}")
                print(diff, end='')

        elif new_sha and not old_sha:
            # Added
            blob = Blob.read(new_sha, repo_root)
            if is_binary(blob.data):
                print(f"Binary file {name} added")
            else:
                new_lines = blob.data.decode('utf-8', errors='replace').split('\n')
                if new_lines and new_lines[-1] == '':
                    new_lines = new_lines[:-1]
                diff = create_unified_diff([], new_lines, f"a/{name}", f"b/{name}")
                print(diff, end='')

        else:
            # Modified
            old_blob = Blob.read(old_sha, repo_root)
            new_blob = Blob.read(new_sha, repo_root)

            if is_binary(old_blob.data) or is_binary(new_blob.data):
                print(f"Binary file {name} changed")
            else:
                old_lines = old_blob.data.decode('utf-8', errors='replace').split('\n')
                new_lines = new_blob.data.decode('utf-8', errors='replace').split('\n')
                if old_lines and old_lines[-1] == '':
                    old_lines = old_lines[:-1]
                if new_lines and new_lines[-1] == '':
                    new_lines = new_lines[:-1]
                diff = create_unified_diff(old_lines, new_lines, f"a/{name}", f"b/{name}")
                print(diff, end='')


def get_tree_files(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Recursively get all files from a tree."""
    files = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            files.update(get_tree_files(repo_root, entry.sha, full_path + '/'))
        else:
            files[full_path] = entry.sha

    return files


def format_date(date_str: str) -> str:
    """Format git date string for display."""
    from datetime import datetime, timezone
    try:
        parts = date_str.split()
        ts = int(parts[0])
        tz = parts[1] if len(parts) > 1 else '+0000'
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime('%a %b %d %H:%M:%S %Y') + f" {tz}"
    except:
        return date_str


def is_binary(data: bytes) -> bool:
    """Check if data appears to be binary."""
    sample = data[:8000]
    return b'\x00' in sample
