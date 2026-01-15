"""show command - Show object content."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Show object content."""
    from utils import find_repo_root, read_object
    from refs import resolve_ref, get_head_sha
    from objects import read_commit, read_tree, read_blob, read_tag
    from diff_algo import diff_files

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    target = 'HEAD'
    if args:
        target = args[0]

    # Handle path specifier (e.g., HEAD:file.txt)
    if ':' in target:
        ref_part, path = target.split(':', 1)
        ref_sha = resolve_ref(repo_root, ref_part)
        if ref_sha is None:
            print(f"error: unknown revision '{ref_part}'", file=sys.stderr)
            return 1

        # Get the file content
        commit = read_commit(repo_root, ref_sha)
        entry = get_tree_entry(repo_root, commit['tree'], path)
        if entry is None:
            print(f"error: path '{path}' not found in '{ref_part}'", file=sys.stderr)
            return 1

        content = read_blob(repo_root, entry.sha)
        try:
            print(content.decode(), end='')
        except:
            sys.stdout.buffer.write(content)
        return 0

    # Resolve the reference
    sha = resolve_ref(repo_root, target)
    if sha is None:
        print(f"error: unknown revision '{target}'", file=sys.stderr)
        return 1

    # Determine object type
    obj_type, data = read_object(repo_root, sha)

    if obj_type == 'commit':
        show_commit(repo_root, sha)
    elif obj_type == 'tree':
        show_tree(repo_root, sha)
    elif obj_type == 'blob':
        try:
            print(data.decode(), end='')
        except:
            sys.stdout.buffer.write(data)
    elif obj_type == 'tag':
        show_tag(repo_root, sha)
    else:
        print(f"Unknown object type: {obj_type}", file=sys.stderr)
        return 1

    return 0


def get_tree_entry(repo_root, tree_sha: str, path: str):
    """Get entry from tree by path."""
    from objects import read_tree

    parts = path.split('/')
    current_sha = tree_sha

    for i, part in enumerate(parts):
        entries = read_tree(repo_root, current_sha)
        found = None
        for entry in entries:
            if entry.name == part:
                found = entry
                break

        if found is None:
            return None

        if i < len(parts) - 1:
            if found.mode != '40000':
                return None
            current_sha = found.sha
        else:
            return found

    return None


def show_commit(repo_root, sha: str):
    """Display commit information."""
    from objects import read_commit, read_tree, read_blob
    from datetime import datetime
    from diff_algo import diff_files
    from utils import is_binary_file

    commit = read_commit(repo_root, sha)

    print(f"commit {sha}")

    # Parse author
    author = commit.get('author', 'Unknown')
    parts = author.rsplit(' ', 2)
    if len(parts) >= 3:
        author_info = parts[0]
        timestamp = parts[1]
        tz = parts[2]

        try:
            ts = int(timestamp)
            dt = datetime.utcfromtimestamp(ts)
            date_str = dt.strftime('%a %b %d %H:%M:%S %Y') + f" {tz}"
        except:
            date_str = f"{timestamp} {tz}"

        print(f"Author: {author_info}")
        print(f"Date:   {date_str}")
    else:
        print(f"Author: {author}")

    print()
    for line in commit['message'].split('\n'):
        print(f"    {line}")
    print()

    # Show diff from parent
    if commit['parents']:
        parent_sha = commit['parents'][0]
        parent_commit = read_commit(repo_root, parent_sha)
        show_tree_diff(repo_root, parent_commit['tree'], commit['tree'])
    else:
        # First commit - show all files as added
        show_tree_diff(repo_root, None, commit['tree'])


def show_tree_diff(repo_root, old_tree_sha, new_tree_sha):
    """Show diff between two trees."""
    from objects import read_tree, read_blob
    from diff_algo import diff_files
    from utils import is_binary_file

    def get_tree_files(tree_sha, prefix=''):
        if tree_sha is None:
            return {}
        files = {}
        try:
            tree_entries = read_tree(repo_root, tree_sha)
            for entry in tree_entries:
                path = f"{prefix}{entry.name}" if prefix else entry.name
                if entry.mode == '40000':
                    files.update(get_tree_files(entry.sha, path + '/'))
                else:
                    files[path] = entry.sha
        except:
            pass
        return files

    old_files = get_tree_files(old_tree_sha)
    new_files = get_tree_files(new_tree_sha)

    all_paths = set(old_files.keys()) | set(new_files.keys())

    for path in sorted(all_paths):
        old_sha = old_files.get(path)
        new_sha = new_files.get(path)

        if old_sha == new_sha:
            continue

        old_content = None
        new_content = None

        if old_sha:
            try:
                data = read_blob(repo_root, old_sha)
                if is_binary_file(data):
                    print(f"Binary file {path} differs")
                    continue
                old_content = data.decode()
            except:
                pass

        if new_sha:
            try:
                data = read_blob(repo_root, new_sha)
                if is_binary_file(data):
                    print(f"Binary file {path} differs")
                    continue
                new_content = data.decode()
            except:
                pass

        diff_output = diff_files(old_content, new_content, path)
        if diff_output:
            print(diff_output)


def show_tree(repo_root, sha: str):
    """Display tree contents."""
    from objects import read_tree

    entries = read_tree(repo_root, sha)
    for entry in entries:
        type_name = 'tree' if entry.mode == '40000' else 'blob'
        print(f"{entry.mode} {type_name} {entry.sha}\t{entry.name}")


def show_tag(repo_root, sha: str):
    """Display tag information."""
    from objects import read_tag

    tag = read_tag(repo_root, sha)

    print(f"tag {tag['tag']}")
    print(f"Tagger: {tag['tagger']}")
    print()
    print(tag['message'])
    print()
    print(f"commit {tag['object']}")
