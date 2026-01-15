"""show command - Show object content."""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import (
    read_object, Commit, Tree, Tag, Blob, resolve_object
)
from diff_algo import format_unified_diff


def format_date(author_line: str) -> str:
    """Extract and format date from author/committer line."""
    parts = author_line.rsplit(' ', 2)
    if len(parts) >= 3:
        try:
            timestamp = int(parts[-2])
            tz = parts[-1]
            dt = datetime.fromtimestamp(timestamp)
            return dt.strftime('%a %b %d %H:%M:%S %Y') + f' {tz}'
        except:
            pass
    return ''


def get_tree_files(tree_sha: str, repo_root: Path) -> dict:
    """Get all files from a tree as {path: sha}."""
    files = {}

    def walk_tree(sha: str, prefix: str):
        try:
            _, data = read_object(sha, repo_root)
            tree = Tree.deserialize(data)
            for entry in tree.entries:
                path = f'{prefix}{entry.name}' if prefix else entry.name
                if entry.mode.startswith('40'):
                    walk_tree(entry.sha, path + '/')
                else:
                    files[path] = entry.sha
        except:
            pass

    walk_tree(tree_sha, '')
    return files


def run(args):
    """Show object content."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Default to HEAD
    if not args:
        target = 'HEAD'
    else:
        target = args[0]

    try:
        sha = resolve_object(target, repo_root)
    except ValueError as e:
        print(f"fatal: {e}", file=sys.stderr)
        return 1

    obj_type, data = read_object(sha, repo_root)

    if obj_type == 'commit':
        show_commit(sha, data, repo_root)
    elif obj_type == 'tree':
        show_tree(sha, data, repo_root)
    elif obj_type == 'blob':
        show_blob(data)
    elif obj_type == 'tag':
        show_tag(sha, data, repo_root)
    else:
        print(f"Unknown object type: {obj_type}", file=sys.stderr)
        return 1

    return 0


def show_commit(sha: str, data: bytes, repo_root: Path):
    """Show commit with diff."""
    commit = Commit.deserialize(data)

    print(f'commit {sha}')

    if len(commit.parents) > 1:
        print(f'Merge: {" ".join(p[:7] for p in commit.parents)}')

    # Parse author
    author_parts = commit.author.rsplit(' ', 2)
    if len(author_parts) >= 3:
        author_name = author_parts[0]
    else:
        author_name = commit.author
    print(f'Author: {author_name}')
    print(f'Date:   {format_date(commit.author)}')

    print()
    for line in commit.message.split('\n'):
        print(f'    {line}')
    print()

    # Show diff from parent
    if commit.parents:
        parent_sha = commit.parents[0]
        try:
            _, parent_data = read_object(parent_sha, repo_root)
            parent_commit = Commit.deserialize(parent_data)
            parent_files = get_tree_files(parent_commit.tree_sha, repo_root)
        except:
            parent_files = {}
    else:
        parent_files = {}

    current_files = get_tree_files(commit.tree_sha, repo_root)
    show_files_diff(parent_files, current_files, repo_root)


def show_tree(sha: str, data: bytes, repo_root: Path):
    """Show tree contents."""
    tree = Tree.deserialize(data)

    for entry in tree.entries:
        if entry.mode.startswith('40'):
            obj_type = 'tree'
        else:
            obj_type = 'blob'
        print(f'{entry.mode} {obj_type} {entry.sha}\t{entry.name}')


def show_blob(data: bytes):
    """Show blob content."""
    try:
        print(data.decode('utf-8'), end='')
    except UnicodeDecodeError:
        print("(binary content)")


def show_tag(sha: str, data: bytes, repo_root: Path):
    """Show tag info."""
    tag = Tag.deserialize(data)

    print(f'tag {tag.tag_name}')
    print(f'Tagger: {tag.tagger}')
    print()
    print(tag.message)
    print()

    # Show referenced object
    print(f'object {tag.object_sha}')
    print(f'type {tag.object_type}')


def show_files_diff(old_files: dict, new_files: dict, repo_root: Path):
    """Show diff between two file sets."""
    all_files = set(old_files.keys()) | set(new_files.keys())

    for name in sorted(all_files):
        old_sha = old_files.get(name)
        new_sha = new_files.get(name)

        if old_sha == new_sha:
            continue

        # Get content
        if old_sha:
            _, old_content = read_object(old_sha, repo_root)
        else:
            old_content = b''

        if new_sha:
            _, new_content = read_object(new_sha, repo_root)
        else:
            new_content = b''

        # Check for binary
        if b'\x00' in old_content[:8000] or b'\x00' in new_content[:8000]:
            print(f'diff --git a/{name} b/{name}')
            print(f'Binary files differ')
            continue

        # Text diff
        try:
            old_text = old_content.decode('utf-8')
            new_text = new_content.decode('utf-8')
        except UnicodeDecodeError:
            print(f'diff --git a/{name} b/{name}')
            print(f'Binary files differ')
            continue

        old_lines = old_text.splitlines(keepends=False)
        new_lines = new_text.splitlines(keepends=False)

        diff_output = format_unified_diff(f'a/{name}', f'b/{name}', old_lines, new_lines)

        if diff_output:
            print(f'diff --git a/{name} b/{name}')
            if old_sha is None:
                print('new file mode 100644')
            elif new_sha is None:
                print('deleted file mode 100644')
            print(diff_output)
