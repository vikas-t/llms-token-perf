"""status command - Show working tree status."""

import sys
import os
from pathlib import Path


def run(args: list[str]) -> int:
    """Show working tree status."""
    from utils import find_repo_root
    from index import read_index
    from refs import get_head_sha, get_current_branch, is_head_detached
    from objects import read_commit, read_tree, read_blob

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse flags
    short_format = '--short' in args or '-s' in args
    porcelain = '--porcelain' in args

    # Get current branch
    branch = get_current_branch(repo_root)
    head_sha = get_head_sha(repo_root)

    if not short_format and not porcelain:
        if branch:
            print(f"On branch {branch}")
        elif head_sha:
            print(f"HEAD detached at {head_sha[:7]}")
        else:
            print("On branch main")
            print("\nNo commits yet\n")

    # Get index entries
    index_entries = {e['path']: e for e in read_index(repo_root)}

    # Get committed files
    committed_files = {}
    if head_sha:
        def get_tree_files(tree_sha: str, prefix: str = '') -> dict:
            files = {}
            try:
                tree_entries = read_tree(repo_root, tree_sha)
                for entry in tree_entries:
                    path = f"{prefix}{entry.name}" if prefix else entry.name
                    if entry.mode == '40000':
                        files.update(get_tree_files(entry.sha, path + '/'))
                    else:
                        files[path] = {'sha': entry.sha, 'mode': entry.mode}
            except:
                pass
            return files

        try:
            commit = read_commit(repo_root, head_sha)
            committed_files = get_tree_files(commit['tree'])
        except:
            pass

    # Get working tree files
    working_files = {}
    for root, dirs, files in os.walk(repo_root):
        if '.minigit' in dirs:
            dirs.remove('.minigit')
        for file in files:
            abs_path = Path(root) / file
            rel_path = str(abs_path.relative_to(repo_root))
            stat = abs_path.stat()
            working_files[rel_path] = {
                'size': stat.st_size,
                'mtime': stat.st_mtime,
                'mode': '100755' if stat.st_mode & 0o111 else '100644'
            }

    # Categorize files
    staged_new = []
    staged_modified = []
    staged_deleted = []
    unstaged_modified = []
    unstaged_deleted = []
    untracked = []

    # Check staged changes (index vs HEAD)
    for path, entry in index_entries.items():
        if path not in committed_files:
            staged_new.append(path)
        elif entry['sha'] != committed_files[path]['sha']:
            staged_modified.append(path)

    # Check for staged deletions
    for path in committed_files:
        if path not in index_entries:
            staged_deleted.append(path)

    # Check unstaged changes (working tree vs index)
    for path, entry in index_entries.items():
        if path not in working_files:
            unstaged_deleted.append(path)
        else:
            # Check if file content changed
            full_path = repo_root / path
            if full_path.is_symlink():
                content = os.readlink(full_path).encode()
            else:
                content = full_path.read_bytes()

            from utils import hash_object_data
            current_sha = hash_object_data('blob', content)
            if current_sha != entry['sha']:
                unstaged_modified.append(path)

    # Check untracked files
    tracked_paths = set(index_entries.keys()) | set(committed_files.keys())
    for path in working_files:
        if path not in tracked_paths:
            untracked.append(path)

    # Sort all lists
    staged_new.sort()
    staged_modified.sort()
    staged_deleted.sort()
    unstaged_modified.sort()
    unstaged_deleted.sort()
    untracked.sort()

    # Output
    if porcelain or short_format:
        # Short format: XY filename
        for path in staged_new:
            x = 'A'
            y = ' '
            if path in unstaged_modified:
                y = 'M'
            print(f"{x}{y} {path}")

        for path in staged_modified:
            x = 'M'
            y = ' '
            if path in unstaged_modified:
                y = 'M'
            print(f"{x}{y} {path}")

        for path in staged_deleted:
            print(f"D  {path}")

        for path in unstaged_modified:
            if path not in staged_modified and path not in staged_new:
                print(f" M {path}")

        for path in unstaged_deleted:
            if path not in staged_deleted:
                print(f" D {path}")

        for path in untracked:
            print(f"?? {path}")

    else:
        # Long format
        has_staged = staged_new or staged_modified or staged_deleted
        has_unstaged = unstaged_modified or unstaged_deleted
        has_untracked = untracked

        if has_staged:
            print("\nChanges to be committed:")
            print("  (use \"minigit restore --staged <file>...\" to unstage)")
            print()
            for path in staged_new:
                print(f"\tnew file:   {path}")
            for path in staged_modified:
                print(f"\tmodified:   {path}")
            for path in staged_deleted:
                print(f"\tdeleted:    {path}")

        if has_unstaged:
            print("\nChanges not staged for commit:")
            print("  (use \"minigit add <file>...\" to update what will be committed)")
            print()
            for path in unstaged_modified:
                print(f"\tmodified:   {path}")
            for path in unstaged_deleted:
                print(f"\tdeleted:    {path}")

        if has_untracked:
            print("\nUntracked files:")
            print("  (use \"minigit add <file>...\" to include in what will be committed)")
            print()
            for path in untracked:
                print(f"\t{path}")

        if not has_staged and not has_unstaged and not has_untracked:
            print("nothing to commit, working tree clean")

    return 0
