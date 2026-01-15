"""commit command - Create a new commit."""

import sys
import os
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_file_mode
from objects import Blob, Tree, TreeEntry, Commit
from index import Index, create_entry_from_file
from refs import resolve_head, update_head, get_head_ref, write_ref


def run(args: list[str]) -> int:
    """Create a new commit."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    message = None
    amend = False
    auto_stage = False

    i = 0
    while i < len(args):
        if args[i] == '-m' and i + 1 < len(args):
            message = args[i + 1]
            i += 2
        elif args[i] == '--amend':
            amend = True
            i += 1
        elif args[i] in ('-a', '--all'):
            auto_stage = True
            i += 1
        else:
            i += 1

    if message is None:
        print("fatal: commit message required (-m)", file=sys.stderr)
        return 1

    index = Index.read(repo_root)

    # Auto-stage modified tracked files if -a flag
    if auto_stage:
        auto_stage_modified(repo_root, index)
        index.write(repo_root)

    # Check if there are staged changes
    current_head = resolve_head(repo_root)

    if amend and current_head is None:
        print("fatal: nothing to amend", file=sys.stderr)
        return 1

    if not index.entries:
        print("fatal: nothing to commit", file=sys.stderr)
        return 1

    # Check if there are actual changes
    if current_head and not amend:
        current_commit = Commit.read(current_head, repo_root)
        new_tree_sha = build_tree(repo_root, index)
        if new_tree_sha == current_commit.tree_sha:
            print("nothing to commit, working tree clean", file=sys.stderr)
            return 1

    # Build tree from index
    tree_sha = build_tree(repo_root, index)

    # Get parent(s)
    parents = []
    if amend:
        old_commit = Commit.read(current_head, repo_root)
        parents = old_commit.parents
    elif current_head:
        parents = [current_head]

    # Get author/committer info
    author = os.environ.get('GIT_AUTHOR_NAME', 'Unknown')
    author_email = os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com')
    committer = os.environ.get('GIT_COMMITTER_NAME', author)
    committer_email = os.environ.get('GIT_COMMITTER_EMAIL', author_email)

    # Get timestamps
    author_date = format_timestamp(os.environ.get('GIT_AUTHOR_DATE'))
    committer_date = format_timestamp(os.environ.get('GIT_COMMITTER_DATE'))

    # Create commit
    commit = Commit(
        tree_sha=tree_sha,
        parents=parents,
        author=author,
        author_email=author_email,
        author_date=author_date,
        committer=committer,
        committer_email=committer_email,
        committer_date=committer_date,
        message=message
    )
    commit_sha = commit.write(repo_root)

    # Update HEAD/branch
    head_ref = get_head_ref(repo_root)
    if head_ref:
        write_ref(repo_root, head_ref, commit_sha)
    else:
        # Detached HEAD
        from refs import write_head
        write_head(repo_root, commit_sha)

    print(f"[{get_branch_name(repo_root)} {commit_sha[:7]}] {message.split(chr(10))[0]}")
    return 0


def build_tree(repo_root: Path, index: Index) -> str:
    """Build tree object(s) from index entries."""
    entries = index.get_all_entries()

    # Group entries by top-level directory
    root_entries = []
    subdirs = {}

    for entry in entries:
        parts = entry.name.split('/')
        if len(parts) == 1:
            # File at root
            root_entries.append(TreeEntry(entry.mode, entry.name, entry.sha))
        else:
            # File in subdirectory
            top_dir = parts[0]
            rest = '/'.join(parts[1:])
            if top_dir not in subdirs:
                subdirs[top_dir] = []
            subdirs[top_dir].append((rest, entry))

    # Recursively build subtrees
    for dir_name, sub_entries in subdirs.items():
        subtree_sha = build_subtree(repo_root, sub_entries)
        root_entries.append(TreeEntry(0o40000, dir_name, subtree_sha))

    tree = Tree(root_entries)
    return tree.write(repo_root)


def build_subtree(repo_root: Path, entries: list) -> str:
    """Recursively build a subtree."""
    root_entries = []
    subdirs = {}

    for rel_path, entry in entries:
        parts = rel_path.split('/')
        if len(parts) == 1:
            root_entries.append(TreeEntry(entry.mode, rel_path, entry.sha))
        else:
            top_dir = parts[0]
            rest = '/'.join(parts[1:])
            if top_dir not in subdirs:
                subdirs[top_dir] = []
            subdirs[top_dir].append((rest, entry))

    for dir_name, sub_entries in subdirs.items():
        subtree_sha = build_subtree(repo_root, sub_entries)
        root_entries.append(TreeEntry(0o40000, dir_name, subtree_sha))

    tree = Tree(root_entries)
    return tree.write(repo_root)


def format_timestamp(date_str: str = None) -> str:
    """Format a timestamp for git commit."""
    if date_str:
        # Parse ISO format date
        try:
            if date_str.endswith('Z'):
                date_str = date_str[:-1] + '+00:00'
            dt = datetime.fromisoformat(date_str)
            ts = int(dt.timestamp())
            offset = dt.strftime('%z')
            if offset:
                offset = offset[:3] + offset[3:]
            else:
                offset = '+0000'
            return f"{ts} {offset}"
        except:
            pass

    # Default to current time
    now = datetime.now(timezone.utc)
    ts = int(now.timestamp())
    return f"{ts} +0000"


def get_branch_name(repo_root: Path) -> str:
    """Get current branch name for commit message."""
    from refs import get_current_branch
    branch = get_current_branch(repo_root)
    return branch or "HEAD"


def auto_stage_modified(repo_root: Path, index: Index):
    """Auto-stage modified tracked files."""
    for name, entry in list(index.entries.items()):
        file_path = repo_root / name
        if file_path.exists():
            # Check if file is modified
            if file_path.is_symlink():
                content = os.readlink(file_path).encode()
                mode = 0o120000
            else:
                content = file_path.read_bytes()
                mode = get_file_mode(file_path)

            blob = Blob(content)
            if blob.sha != entry.sha:
                blob.write(repo_root)
                new_entry = create_entry_from_file(file_path, name, blob.sha, mode)
                index.add_entry(new_entry)
