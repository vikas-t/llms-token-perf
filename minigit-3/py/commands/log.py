"""log command - Show commit history."""

import sys
from pathlib import Path
from datetime import datetime


def run(args: list[str]) -> int:
    """Show commit history."""
    from utils import find_repo_root
    from refs import resolve_ref, get_head_sha, list_branches
    from objects import read_commit

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    oneline = False
    show_all = False
    show_graph = False
    show_stat = False
    limit = None
    start_ref = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--oneline':
            oneline = True
        elif arg == '--all':
            show_all = True
        elif arg == '--graph':
            show_graph = True
        elif arg == '--stat':
            show_stat = True
        elif arg == '-n' and i + 1 < len(args):
            try:
                limit = int(args[i + 1])
            except ValueError:
                pass
            i += 1
        elif not arg.startswith('-'):
            start_ref = arg
        i += 1

    # Get starting commits
    starting_shas = []

    if show_all:
        # Start from all branches
        for branch in list_branches(repo_root):
            sha = resolve_ref(repo_root, branch)
            if sha:
                starting_shas.append(sha)
    elif start_ref:
        sha = resolve_ref(repo_root, start_ref)
        if sha is None:
            print(f"error: unknown revision '{start_ref}'", file=sys.stderr)
            return 1
        starting_shas.append(sha)
    else:
        sha = get_head_sha(repo_root)
        if sha is None:
            print("error: no commits yet", file=sys.stderr)
            return 1
        starting_shas.append(sha)

    # Walk commit history
    visited = set()
    to_visit = list(starting_shas)
    commits = []

    while to_visit:
        sha = to_visit.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        try:
            commit = read_commit(repo_root, sha)
            commits.append((sha, commit))

            for parent in commit['parents']:
                if parent not in visited:
                    to_visit.append(parent)
        except Exception as e:
            continue

    # Sort by timestamp (newest first)
    def get_timestamp(item):
        sha, commit = item
        author = commit.get('author', '')
        # Parse timestamp from author line
        parts = author.rsplit(' ', 2)
        if len(parts) >= 2:
            try:
                return int(parts[-2])
            except:
                pass
        return 0

    commits.sort(key=get_timestamp, reverse=True)

    # Apply limit
    if limit:
        commits = commits[:limit]

    # Output
    for sha, commit in commits:
        if oneline:
            prefix = '* ' if show_graph else ''
            msg_first_line = commit['message'].split('\n')[0]
            print(f"{prefix}{sha[:7]} {msg_first_line}")
        else:
            if show_graph:
                print("*", end=" ")
            print(f"commit {sha}")

            # Parse author info
            author = commit.get('author', 'Unknown')
            # Format: Name <email> timestamp tz
            parts = author.rsplit(' ', 2)
            if len(parts) >= 3:
                author_info = parts[0]
                timestamp = parts[1]
                tz = parts[2]

                # Format date
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

            # Show stat if requested
            if show_stat and commit['parents']:
                parent_sha = commit['parents'][0]
                try:
                    parent = read_commit(repo_root, parent_sha)
                    show_commit_stat(repo_root, parent['tree'], commit['tree'])
                except:
                    pass

    return 0


def show_commit_stat(repo_root, old_tree_sha: str, new_tree_sha: str):
    """Show file changes between two trees."""
    from objects import read_tree

    def get_tree_files(tree_sha: str, prefix: str = '') -> dict:
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

        if old_sha is None:
            print(f" {path} | new file")
        elif new_sha is None:
            print(f" {path} | deleted")
        else:
            print(f" {path} | modified")
