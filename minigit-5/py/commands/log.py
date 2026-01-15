"""log command - Show commit history."""

import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Commit
from refs import resolve_head, resolve_revision, list_branches, read_ref


def run(args: list[str]) -> int:
    """Show commit history."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    oneline = False
    show_all = False
    limit = None
    graph = False
    stat = False
    revision = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--oneline':
            oneline = True
        elif arg == '--all':
            show_all = True
        elif arg == '--graph':
            graph = True
        elif arg == '--stat':
            stat = True
        elif arg == '-n' and i + 1 < len(args):
            limit = int(args[i + 1])
            i += 1
        elif not arg.startswith('-'):
            revision = arg
        i += 1

    # Determine starting points
    if show_all:
        start_shas = get_all_branch_heads(repo_root)
    elif revision:
        sha = resolve_revision(repo_root, revision)
        if sha is None:
            print(f"fatal: unknown revision '{revision}'", file=sys.stderr)
            return 1
        start_shas = [sha]
    else:
        head_sha = resolve_head(repo_root)
        if head_sha is None:
            print("fatal: your current branch does not have any commits yet", file=sys.stderr)
            return 1
        start_shas = [head_sha]

    # Collect commits
    commits = collect_commits(repo_root, start_shas, limit)

    if not commits:
        return 0

    # Output
    for i, (sha, commit) in enumerate(commits):
        if oneline:
            print_oneline(sha, commit, graph and i > 0)
        else:
            print_full(sha, commit, stat, repo_root)
            if i < len(commits) - 1:
                print()

    return 0


def get_all_branch_heads(repo_root: Path) -> list:
    """Get SHA of all branch heads."""
    shas = []
    for branch in list_branches(repo_root):
        sha = read_ref(repo_root, f'refs/heads/{branch}')
        if sha:
            shas.append(sha)
    return shas


def collect_commits(repo_root: Path, start_shas: list, limit: int = None) -> list:
    """Collect commits from starting points, sorted by date."""
    visited = set()
    commits = []
    queue = list(start_shas)

    while queue and (limit is None or len(commits) < limit):
        sha = queue.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        try:
            commit = Commit.read(sha, repo_root)
        except:
            continue

        commits.append((sha, commit))

        # Add parents to queue
        for parent in commit.parents:
            if parent not in visited:
                queue.append(parent)

    # Sort by timestamp (most recent first)
    commits.sort(key=lambda x: get_commit_timestamp(x[1]), reverse=True)

    if limit:
        commits = commits[:limit]

    return commits


def get_commit_timestamp(commit: Commit) -> int:
    """Extract timestamp from commit."""
    try:
        parts = commit.author_date.split()
        return int(parts[0])
    except:
        return 0


def print_oneline(sha: str, commit: Commit, show_graph: bool):
    """Print one-line commit format."""
    first_line = commit.message.split('\n')[0]
    prefix = "* " if show_graph else ""
    print(f"{prefix}{sha[:7]} {first_line}")


def print_full(sha: str, commit: Commit, stat: bool, repo_root: Path):
    """Print full commit format."""
    print(f"commit {sha}")

    # Show merge parents if any
    if len(commit.parents) > 1:
        parent_short = ' '.join(p[:7] for p in commit.parents)
        print(f"Merge: {parent_short}")

    print(f"Author: {commit.author} <{commit.author_email}>")
    print(f"Date:   {format_date(commit.author_date)}")
    print()

    # Indent message
    for line in commit.message.split('\n'):
        print(f"    {line}")

    if stat and commit.parents:
        print()
        print_stat(repo_root, commit.parents[0], sha)


def format_date(date_str: str) -> str:
    """Format git date string for display."""
    try:
        parts = date_str.split()
        ts = int(parts[0])
        tz = parts[1] if len(parts) > 1 else '+0000'

        # Parse timezone
        tz_hours = int(tz[:3])
        tz_mins = int(tz[0] + tz[3:5])

        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime('%a %b %d %H:%M:%S %Y') + f" {tz}"
    except:
        return date_str


def print_stat(repo_root: Path, parent_sha: str, commit_sha: str):
    """Print stat for commit."""
    from objects import Tree

    try:
        parent_commit = Commit.read(parent_sha, repo_root)
        commit = Commit.read(commit_sha, repo_root)

        parent_files = get_all_files(repo_root, parent_commit.tree_sha)
        commit_files = get_all_files(repo_root, commit.tree_sha)

        # Find changes
        all_files = set(parent_files.keys()) | set(commit_files.keys())

        for name in sorted(all_files):
            if name not in parent_files:
                print(f" {name} | new file")
            elif name not in commit_files:
                print(f" {name} | deleted")
            elif parent_files[name] != commit_files[name]:
                print(f" {name} | modified")
    except:
        pass


def get_all_files(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Get all files from a tree."""
    from objects import Tree

    files = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            files.update(get_all_files(repo_root, entry.sha, full_path + '/'))
        else:
            files[full_path] = entry.sha

    return files
