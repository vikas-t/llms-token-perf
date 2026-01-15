"""commit command - Create a new commit."""

import sys
import os
import time
from pathlib import Path
from typing import Optional, Dict

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from objects import (
    Tree, TreeEntry, Commit, write_object, read_object,
    resolve_object, hash_object
)
from index import Index, IndexEntry
from refs import get_head, set_ref, resolve_head, get_current_branch


def build_tree_from_entries(entries: Dict[str, IndexEntry], repo_root: Path) -> str:
    """Build a tree object (and subtrees) from index entries."""
    # Group entries by directory
    trees = {}  # dir_path -> list of (name, mode, sha)

    for name, entry in sorted(entries.items()):
        parts = name.split('/')
        if len(parts) == 1:
            # Root level file
            if '' not in trees:
                trees[''] = []
            mode_str = f'{entry.mode:o}'
            trees[''].append((parts[0], mode_str, entry.sha))
        else:
            # File in subdirectory
            dir_path = '/'.join(parts[:-1])
            file_name = parts[-1]
            if dir_path not in trees:
                trees[dir_path] = []
            mode_str = f'{entry.mode:o}'
            trees[dir_path].append((file_name, mode_str, entry.sha))

    # Build trees bottom-up
    dir_shas = {}

    # Sort directories by depth (deepest first)
    all_dirs = list(trees.keys())
    all_dirs.sort(key=lambda d: d.count('/'), reverse=True)

    for dir_path in all_dirs:
        items = trees[dir_path]

        # Add subdirectories
        for subdir_path, subdir_sha in dir_shas.items():
            if subdir_path.startswith(dir_path + '/') if dir_path else '/' not in subdir_path:
                # Check if this is a direct child
                if dir_path:
                    rel = subdir_path[len(dir_path) + 1:]
                else:
                    rel = subdir_path
                if '/' not in rel:
                    items.append((rel, '40000', subdir_sha))

        # Create tree
        tree_entries = []
        for name, mode, sha in sorted(items, key=lambda x: x[0] + ('/' if x[1] == '40000' else '')):
            tree_entries.append(TreeEntry(mode, name, sha))

        tree = Tree(tree_entries)
        tree_data = tree.serialize()
        tree_sha = write_object('tree', tree_data, repo_root)
        dir_shas[dir_path] = tree_sha

    return dir_shas.get('', '')


def build_tree(entries: Dict[str, IndexEntry], repo_root: Path) -> str:
    """Build tree objects from index entries and return root tree SHA."""
    # Build tree structure
    root = {}

    for name, entry in entries.items():
        parts = name.split('/')
        current = root
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        # Store the file entry
        mode_str = f'{entry.mode:o}'
        current[parts[-1]] = (mode_str, entry.sha)

    # Recursively create tree objects
    def make_tree(node: dict) -> str:
        tree_entries = []
        for name, value in sorted(node.items()):
            if isinstance(value, dict):
                # Subdirectory
                subtree_sha = make_tree(value)
                tree_entries.append(TreeEntry('40000', name, subtree_sha))
            else:
                # File
                mode, sha = value
                tree_entries.append(TreeEntry(mode, name, sha))

        tree = Tree(tree_entries)
        tree_data = tree.serialize()
        return write_object('tree', tree_data, repo_root)

    return make_tree(root)


def get_author_info() -> str:
    """Get author/committer info from environment."""
    name = os.environ.get('GIT_AUTHOR_NAME', os.environ.get('USER', 'Unknown'))
    email = os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com')
    date = os.environ.get('GIT_AUTHOR_DATE', '')

    if date:
        # Parse ISO format date
        try:
            from datetime import datetime
            if 'T' in date:
                # ISO format
                dt = datetime.fromisoformat(date.replace('Z', '+00:00'))
                timestamp = int(dt.timestamp())
                tz_offset = dt.strftime('%z')
                if not tz_offset:
                    tz_offset = '+0000'
            else:
                timestamp = int(time.time())
                tz_offset = time.strftime('%z')
        except:
            timestamp = int(time.time())
            tz_offset = time.strftime('%z')
    else:
        timestamp = int(time.time())
        tz_offset = time.strftime('%z')

    if not tz_offset:
        tz_offset = '+0000'

    return f'{name} <{email}> {timestamp} {tz_offset}'


def get_committer_info() -> str:
    """Get committer info from environment."""
    name = os.environ.get('GIT_COMMITTER_NAME', os.environ.get('GIT_AUTHOR_NAME', os.environ.get('USER', 'Unknown')))
    email = os.environ.get('GIT_COMMITTER_EMAIL', os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com'))
    date = os.environ.get('GIT_COMMITTER_DATE', os.environ.get('GIT_AUTHOR_DATE', ''))

    if date:
        try:
            from datetime import datetime
            if 'T' in date:
                dt = datetime.fromisoformat(date.replace('Z', '+00:00'))
                timestamp = int(dt.timestamp())
                tz_offset = dt.strftime('%z')
                if not tz_offset:
                    tz_offset = '+0000'
            else:
                timestamp = int(time.time())
                tz_offset = time.strftime('%z')
        except:
            timestamp = int(time.time())
            tz_offset = time.strftime('%z')
    else:
        timestamp = int(time.time())
        tz_offset = time.strftime('%z')

    if not tz_offset:
        tz_offset = '+0000'

    return f'{name} <{email}> {timestamp} {tz_offset}'


def run(args):
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
        elif args[i] == '-a':
            auto_stage = True
            i += 1
        else:
            i += 1

    if message is None and not amend:
        print("error: no commit message specified", file=sys.stderr)
        return 1

    # Handle -a flag: auto-stage modified tracked files
    if auto_stage:
        index = Index.read(repo_root)
        for name in list(index.entries.keys()):
            file_path = repo_root / name
            if file_path.exists():
                content = file_path.read_bytes()
                sha = hash_object(content, 'blob', write=True, repo_root=repo_root)
                entry = IndexEntry.from_file(file_path, sha, repo_root)
                index.add_entry(entry)
        index.write(repo_root)

    # Read index
    index = Index.read(repo_root)

    if not index.entries:
        print("nothing to commit, working tree clean", file=sys.stderr)
        return 1

    # Get current HEAD
    head_sha = resolve_head(repo_root)

    # Check if there are actual changes
    if head_sha and not amend:
        try:
            _, data = read_object(head_sha, repo_root)
            head_commit = Commit.deserialize(data)
            # Build tree and compare
            new_tree_sha = build_tree(index.entries, repo_root)
            if new_tree_sha == head_commit.tree_sha:
                print("nothing to commit, working tree clean", file=sys.stderr)
                return 1
        except:
            pass

    # Build tree from index
    tree_sha = build_tree(index.entries, repo_root)

    # Create commit
    commit = Commit()
    commit.tree_sha = tree_sha
    commit.author = get_author_info()
    commit.committer = get_committer_info()

    if amend:
        # Get the commit we're amending
        if head_sha:
            try:
                _, data = read_object(head_sha, repo_root)
                old_commit = Commit.deserialize(data)
                commit.parents = old_commit.parents
                if message is None:
                    message = old_commit.message
            except:
                pass
    else:
        if head_sha:
            commit.parents = [head_sha]

    commit.message = message

    # Write commit
    commit_data = commit.serialize()
    commit_sha = write_object('commit', commit_data, repo_root)

    # Update HEAD
    ref, is_symbolic = get_head(repo_root)
    if is_symbolic:
        set_ref(ref, commit_sha, repo_root)
    else:
        # Detached HEAD
        from refs import set_head
        set_head(commit_sha, symbolic=False, repo_root=repo_root)

    # Print result
    branch = get_current_branch(repo_root)
    if branch:
        print(f"[{branch} {commit_sha[:7]}] {message.split(chr(10))[0]}")
    else:
        print(f"[detached HEAD {commit_sha[:7]}] {message.split(chr(10))[0]}")

    return 0
