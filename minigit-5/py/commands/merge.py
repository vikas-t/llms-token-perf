"""merge command - Merge branches."""

import sys
import os
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_file_mode
from objects import Blob, Tree, Commit
from index import Index, create_entry_from_file
from refs import (
    resolve_head, resolve_revision, get_current_branch, get_head_ref,
    write_ref, read_ref
)
from merge_algo import three_way_merge, find_merge_base


def run(args: list[str]) -> int:
    """Merge branches."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    no_commit = False
    abort = False
    branch = None

    for arg in args:
        if arg == '--no-commit':
            no_commit = True
        elif arg == '--abort':
            abort = True
        elif not arg.startswith('-'):
            branch = arg

    if abort:
        return abort_merge(repo_root)

    if not branch:
        print("fatal: branch name required", file=sys.stderr)
        return 1

    # Resolve branch to SHA
    target_sha = resolve_revision(repo_root, branch)
    if target_sha is None:
        print(f"fatal: '{branch}' is not a valid branch name", file=sys.stderr)
        return 1

    head_sha = resolve_head(repo_root)
    if head_sha is None:
        print("fatal: cannot merge into empty repository", file=sys.stderr)
        return 1

    # Check if already up to date
    if head_sha == target_sha:
        print("Already up to date.")
        return 0

    # Check if target is ancestor of HEAD
    if is_ancestor(repo_root, target_sha, head_sha):
        print("Already up to date.")
        return 0

    # Check if HEAD is ancestor of target (fast-forward)
    if is_ancestor(repo_root, head_sha, target_sha):
        return fast_forward(repo_root, target_sha, branch, no_commit)

    # Need to do a real merge
    return three_way_merge_branches(repo_root, head_sha, target_sha, branch, no_commit)


def fast_forward(repo_root: Path, target_sha: str, branch: str, no_commit: bool) -> int:
    """Perform a fast-forward merge."""
    from commands.checkout import update_working_tree

    update_working_tree(repo_root, target_sha)

    if not no_commit:
        head_ref = get_head_ref(repo_root)
        if head_ref:
            write_ref(repo_root, head_ref, target_sha)

    print(f"Fast-forward to {target_sha[:7]}")
    return 0


def three_way_merge_branches(repo_root: Path, head_sha: str, target_sha: str, branch: str, no_commit: bool) -> int:
    """Perform a three-way merge."""
    # Find merge base
    base_sha = find_merge_base(repo_root, head_sha, target_sha)
    if base_sha is None:
        print("fatal: refusing to merge unrelated histories", file=sys.stderr)
        return 1

    # Get file contents from each version
    base_files = get_tree_files(repo_root, Commit.read(base_sha, repo_root).tree_sha)
    head_files = get_tree_files(repo_root, Commit.read(head_sha, repo_root).tree_sha)
    target_files = get_tree_files(repo_root, Commit.read(target_sha, repo_root).tree_sha)

    # Merge each file
    all_files = set(base_files.keys()) | set(head_files.keys()) | set(target_files.keys())
    index = Index.read(repo_root)
    has_conflicts = False

    for name in sorted(all_files):
        base_sha_file = base_files.get(name, (None, None))[0]
        head_sha_file = head_files.get(name, (None, None))[0]
        target_sha_file = target_files.get(name, (None, None))[0]

        head_mode = head_files.get(name, (None, 0o100644))[1]
        target_mode = target_files.get(name, (None, 0o100644))[1]
        mode = head_mode or target_mode or 0o100644

        conflict = merge_file(
            repo_root, name,
            base_sha_file, head_sha_file, target_sha_file,
            index, mode, branch
        )
        if conflict:
            has_conflicts = True

    index.write(repo_root)

    if has_conflicts:
        # Write merge state
        merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
        merge_head.write_text(target_sha + '\n')
        print("Automatic merge failed; fix conflicts and then commit the result.")
        return 1

    if no_commit:
        print("Automatic merge went well; stopped before committing as requested")
        return 0

    # Create merge commit
    return create_merge_commit(repo_root, head_sha, target_sha, branch, index)


def merge_file(repo_root: Path, name: str,
               base_sha: str, head_sha: str, target_sha: str,
               index: Index, mode: int, branch: str) -> bool:
    """Merge a single file. Returns True if there's a conflict."""
    file_path = repo_root / name

    # Handle cases where file doesn't exist in one or more versions
    if head_sha is None and target_sha is None:
        # File deleted in both - nothing to do
        if file_path.exists():
            file_path.unlink()
        index.remove_entry(name)
        return False

    if head_sha is None:
        # File added or exists only in target
        blob = Blob.read(target_sha, repo_root)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(blob.data)
        entry = create_entry_from_file(file_path, name, target_sha, mode)
        index.add_entry(entry)
        return False

    if target_sha is None:
        # File exists only in head - keep it (unless it was deleted in target)
        if base_sha and base_sha == head_sha:
            # File was deleted in target, unchanged in head - delete it
            if file_path.exists():
                file_path.unlink()
            index.remove_entry(name)
        # Otherwise keep head version
        return False

    if head_sha == target_sha:
        # Same content - no merge needed
        return False

    if base_sha == head_sha:
        # Head unchanged, take target
        blob = Blob.read(target_sha, repo_root)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(blob.data)
        entry = create_entry_from_file(file_path, name, target_sha, mode)
        index.add_entry(entry)
        return False

    if base_sha == target_sha:
        # Target unchanged, keep head
        return False

    # Need to do content merge
    base_content = Blob.read(base_sha, repo_root).data if base_sha else b''
    head_content = Blob.read(head_sha, repo_root).data
    target_content = Blob.read(target_sha, repo_root).data

    # Check for binary
    if is_binary(head_content) or is_binary(target_content):
        # Binary conflict - keep head, report conflict
        print(f"warning: Cannot merge binary file {name}")
        return True

    # Text merge
    base_lines = base_content.decode('utf-8', errors='replace').split('\n')
    head_lines = head_content.decode('utf-8', errors='replace').split('\n')
    target_lines = target_content.decode('utf-8', errors='replace').split('\n')

    # Remove trailing empty line from split
    if base_lines and base_lines[-1] == '':
        base_lines = base_lines[:-1]
    if head_lines and head_lines[-1] == '':
        head_lines = head_lines[:-1]
    if target_lines and target_lines[-1] == '':
        target_lines = target_lines[:-1]

    result = three_way_merge(base_lines, head_lines, target_lines, "HEAD", branch)

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(result.content)

    if not result.has_conflicts:
        blob = Blob(result.content.encode())
        blob.write(repo_root)
        entry = create_entry_from_file(file_path, name, blob.sha, mode)
        index.add_entry(entry)

    return result.has_conflicts


def create_merge_commit(repo_root: Path, head_sha: str, target_sha: str, branch: str, index: Index) -> int:
    """Create a merge commit."""
    from commands.commit import build_tree, format_timestamp

    tree_sha = build_tree(repo_root, index)

    author = os.environ.get('GIT_AUTHOR_NAME', 'Unknown')
    author_email = os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com')
    committer = os.environ.get('GIT_COMMITTER_NAME', author)
    committer_email = os.environ.get('GIT_COMMITTER_EMAIL', author_email)
    author_date = format_timestamp(os.environ.get('GIT_AUTHOR_DATE'))
    committer_date = format_timestamp(os.environ.get('GIT_COMMITTER_DATE'))

    message = f"Merge branch '{branch}'"

    commit = Commit(
        tree_sha=tree_sha,
        parents=[head_sha, target_sha],
        author=author,
        author_email=author_email,
        author_date=author_date,
        committer=committer,
        committer_email=committer_email,
        committer_date=committer_date,
        message=message
    )
    commit_sha = commit.write(repo_root)

    head_ref = get_head_ref(repo_root)
    if head_ref:
        write_ref(repo_root, head_ref, commit_sha)

    # Clean up merge state
    merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
    if merge_head.exists():
        merge_head.unlink()

    current = get_current_branch(repo_root)
    print(f"[{current} {commit_sha[:7]}] {message}")
    return 0


def abort_merge(repo_root: Path) -> int:
    """Abort an in-progress merge."""
    merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
    if not merge_head.exists():
        print("fatal: there is no merge to abort", file=sys.stderr)
        return 1

    # Reset to HEAD
    head_sha = resolve_head(repo_root)
    if head_sha:
        from commands.checkout import update_working_tree
        update_working_tree(repo_root, head_sha)

    merge_head.unlink()
    print("Merge aborted.")
    return 0


def get_tree_files(repo_root: Path, tree_sha: str, prefix: str = '') -> dict:
    """Recursively get all files from a tree."""
    files = {}
    tree = Tree.read(tree_sha, repo_root)

    for entry in tree.entries:
        full_path = f"{prefix}{entry.name}" if prefix else entry.name
        if entry.mode == 0o40000:
            files.update(get_tree_files(repo_root, entry.sha, full_path + '/'))
        else:
            files[full_path] = (entry.sha, entry.mode)

    return files


def is_ancestor(repo_root: Path, commit1: str, commit2: str) -> bool:
    """Check if commit1 is an ancestor of commit2."""
    visited = set()
    queue = [commit2]

    while queue:
        sha = queue.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        if sha == commit1:
            return True

        try:
            commit = Commit.read(sha, repo_root)
            queue.extend(commit.parents)
        except:
            pass

    return False


def is_binary(data: bytes) -> bool:
    """Check if data appears to be binary."""
    sample = data[:8000]
    return b'\x00' in sample
