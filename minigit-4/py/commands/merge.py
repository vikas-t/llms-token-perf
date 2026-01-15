"""merge command - Merge branches."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from objects import (
    read_object, Commit, Tree, resolve_object, write_object, hash_object
)
from index import Index, IndexEntry
from refs import (
    resolve_head, get_current_branch, set_ref, get_head
)
from merge_algo import find_merge_base, merge_files
from commands.commit import build_tree, get_author_info, get_committer_info


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
    """Merge a branch into current branch."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    no_commit = False
    abort = False
    target = None

    for arg in args:
        if arg == '--no-commit':
            no_commit = True
        elif arg == '--abort':
            abort = True
        elif not arg.startswith('-'):
            target = arg

    # Handle abort
    if abort:
        merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
        if merge_head.exists():
            merge_head.unlink()
            print("Merge aborted.")
            return 0
        else:
            print("error: There is no merge in progress", file=sys.stderr)
            return 0

    if not target:
        print("error: no merge target specified", file=sys.stderr)
        return 1

    # Get current HEAD
    head_sha = resolve_head(repo_root)
    if not head_sha:
        print("fatal: no commits on current branch", file=sys.stderr)
        return 1

    # Resolve target
    try:
        target_sha = resolve_object(target, repo_root)
    except ValueError as e:
        print(f"fatal: '{target}' is not a valid branch name", file=sys.stderr)
        return 1

    # Check if already up-to-date
    if head_sha == target_sha:
        print("Already up to date.")
        return 0

    # Find merge base
    base_sha = find_merge_base(head_sha, target_sha, repo_root)

    if base_sha == target_sha:
        print("Already up to date.")
        return 0

    # Get file contents
    _, head_data = read_object(head_sha, repo_root)
    head_commit = Commit.deserialize(head_data)
    head_files = get_tree_files(head_commit.tree_sha, repo_root)

    _, target_data = read_object(target_sha, repo_root)
    target_commit = Commit.deserialize(target_data)
    target_files = get_tree_files(target_commit.tree_sha, repo_root)

    if base_sha:
        _, base_data = read_object(base_sha, repo_root)
        base_commit = Commit.deserialize(base_data)
        base_files = get_tree_files(base_commit.tree_sha, repo_root)
    else:
        base_files = {}

    # Check for fast-forward
    if base_sha == head_sha:
        # Fast-forward merge
        if not no_commit:
            print(f"Updating {head_sha[:7]}..{target_sha[:7]}")
            print("Fast-forward")

        # Update working tree and index
        index = Index.read(repo_root)
        for name, sha in target_files.items():
            file_path = repo_root / name
            _, content = read_object(sha, repo_root)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)
            entry = IndexEntry.from_file(file_path, sha, repo_root)
            index.add_entry(entry)

        # Remove files not in target
        for name in head_files:
            if name not in target_files:
                file_path = repo_root / name
                if file_path.exists():
                    file_path.unlink()
                index.remove_entry(name)

        index.write(repo_root)

        if no_commit:
            # Write MERGE_HEAD for later
            merge_head_path = repo_root / '.minigit' / 'MERGE_HEAD'
            merge_head_path.write_text(target_sha + '\n')
            print(f"Automatic merge went well; stopped before committing as requested")
            return 0

        # Update HEAD
        ref, is_symbolic = get_head(repo_root)
        if is_symbolic:
            set_ref(ref, target_sha, repo_root)
        else:
            from refs import set_head
            set_head(target_sha, symbolic=False, repo_root=repo_root)

        return 0

    # Three-way merge
    has_conflicts = False
    merged_files = {}
    conflict_files = []

    all_files = set(head_files.keys()) | set(target_files.keys()) | set(base_files.keys())

    for name in all_files:
        base_sha = base_files.get(name)
        head_sha_file = head_files.get(name)
        target_sha_file = target_files.get(name)

        # Get content
        if base_sha:
            _, base_content = read_object(base_sha, repo_root)
            base_text = base_content.decode('utf-8', errors='replace')
        else:
            base_text = None

        if head_sha_file:
            _, head_content = read_object(head_sha_file, repo_root)
            head_text = head_content.decode('utf-8', errors='replace')
        else:
            head_text = None

        if target_sha_file:
            _, target_content = read_object(target_sha_file, repo_root)
            target_text = target_content.decode('utf-8', errors='replace')
        else:
            target_text = None

        # Merge
        merged, conflict = merge_files(
            base_text, head_text, target_text,
            'HEAD', target
        )

        if conflict:
            has_conflicts = True
            conflict_files.append(name)

        merged_files[name] = merged

    # Write merged files to working tree and index
    index = Index.read(repo_root)

    for name, content in merged_files.items():
        if content:  # Not deleted
            file_path = repo_root / name
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content)

            sha = hash_object(content.encode(), 'blob', write=True, repo_root=repo_root)
            entry = IndexEntry.from_file(file_path, sha, repo_root)
            index.add_entry(entry)
        else:
            # File deleted
            file_path = repo_root / name
            if file_path.exists():
                file_path.unlink()
            index.remove_entry(name)

    index.write(repo_root)

    if has_conflicts:
        # Write MERGE_HEAD for later
        merge_head_path = repo_root / '.minigit' / 'MERGE_HEAD'
        merge_head_path.write_text(target_sha + '\n')

        print("Automatic merge failed; fix conflicts and then commit the result.")
        for name in conflict_files:
            print(f"CONFLICT (content): Merge conflict in {name}")
        return 1

    if no_commit:
        # Write MERGE_HEAD for later commit
        merge_head_path = repo_root / '.minigit' / 'MERGE_HEAD'
        merge_head_path.write_text(target_sha + '\n')
        print(f"Automatic merge went well; stopped before committing as requested")
        return 0

    # Create merge commit
    tree_sha = build_tree(index.entries, repo_root)

    commit = Commit()
    commit.tree_sha = tree_sha
    commit.parents = [head_sha, target_sha]
    commit.author = get_author_info()
    commit.committer = get_committer_info()
    commit.message = f"Merge branch '{target}'"

    commit_data = commit.serialize()
    commit_sha = write_object('commit', commit_data, repo_root)

    # Update HEAD
    ref, is_symbolic = get_head(repo_root)
    if is_symbolic:
        set_ref(ref, commit_sha, repo_root)
    else:
        from refs import set_head
        set_head(commit_sha, symbolic=False, repo_root=repo_root)

    print(f"Merge made by the 'ort' strategy.")

    return 0
