"""log command - Show commit history."""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import read_object, Commit, resolve_object
from refs import resolve_head, list_branches, get_ref


def format_date(author_line: str) -> str:
    """Extract and format date from author/committer line."""
    # Format: Name <email> timestamp timezone
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


def run(args):
    """Show commit history."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    oneline = False
    show_all = False
    max_count = None
    show_graph = False
    show_stat = False
    start_ref = 'HEAD'

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--oneline':
            oneline = True
        elif arg == '--all':
            show_all = True
        elif arg == '-n' and i + 1 < len(args):
            max_count = int(args[i + 1])
            i += 1
        elif arg.startswith('-n'):
            max_count = int(arg[2:])
        elif arg == '--graph':
            show_graph = True
        elif arg == '--stat':
            show_stat = True
        elif not arg.startswith('-'):
            start_ref = arg
        i += 1

    # Collect starting points
    start_shas = []
    if show_all:
        for branch in list_branches(repo_root):
            sha = get_ref(f'refs/heads/{branch}', repo_root)
            if sha:
                start_shas.append(sha)
    else:
        try:
            sha = resolve_object(start_ref, repo_root)
            start_shas.append(sha)
        except ValueError as e:
            print(f"fatal: {e}", file=sys.stderr)
            return 1

    if not start_shas:
        print("fatal: no commits to show", file=sys.stderr)
        return 1

    # Walk commit history
    visited = set()
    to_visit = list(start_shas)
    commits = []

    while to_visit:
        sha = to_visit.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        try:
            obj_type, data = read_object(sha, repo_root)
            if obj_type != 'commit':
                continue

            commit = Commit.deserialize(data)
            commits.append((sha, commit))

            for parent in commit.parents:
                if parent not in visited:
                    to_visit.append(parent)
        except Exception as e:
            continue

    # Sort by timestamp (most recent first)
    def get_timestamp(item):
        sha, commit = item
        # Parse timestamp from author line
        parts = commit.author.rsplit(' ', 2)
        if len(parts) >= 3:
            try:
                return int(parts[-2])
            except:
                pass
        return 0

    commits.sort(key=get_timestamp, reverse=True)

    # Apply max_count
    if max_count is not None:
        commits = commits[:max_count]

    # Output
    for sha, commit in commits:
        if oneline:
            if show_graph:
                print(f'* {sha[:7]} {commit.message.split(chr(10))[0]}')
            else:
                print(f'{sha[:7]} {commit.message.split(chr(10))[0]}')
        else:
            if show_graph:
                print(f'* commit {sha}')
            else:
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

            if show_stat:
                # Show file changes
                if commit.parents:
                    try:
                        parent_sha = commit.parents[0]
                        _, parent_data = read_object(parent_sha, repo_root)
                        parent_commit = Commit.deserialize(parent_data)
                        parent_files = get_tree_files(parent_commit.tree_sha, repo_root)
                    except:
                        parent_files = {}
                else:
                    parent_files = {}

                current_files = get_tree_files(commit.tree_sha, repo_root)

                # Find differences
                all_files = set(parent_files.keys()) | set(current_files.keys())
                for f in sorted(all_files):
                    if f not in parent_files:
                        print(f' {f} | new file')
                    elif f not in current_files:
                        print(f' {f} | deleted')
                    elif parent_files[f] != current_files[f]:
                        print(f' {f} | modified')
                print()

    return 0


def get_tree_files(tree_sha: str, repo_root: Path) -> dict:
    """Get all files from a tree."""
    from objects import Tree

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
