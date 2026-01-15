"""add command - Stage files for commit."""

import sys
import os
from pathlib import Path


def run(args: list[str]) -> int:
    """Stage files for commit."""
    from utils import find_repo_root
    from objects import create_blob
    from index import read_index, write_index, add_to_index, remove_from_index
    from refs import get_head_sha

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse flags
    all_flag = False
    update_flag = False
    paths = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ('-A', '--all'):
            all_flag = True
        elif arg in ('-u', '--update'):
            update_flag = True
        else:
            paths.append(arg)
        i += 1

    if not paths and not all_flag and not update_flag:
        print("error: nothing specified, nothing added", file=sys.stderr)
        return 1

    # Get currently tracked files (from index)
    entries = read_index(repo_root)
    tracked_files = {e['path'] for e in entries}

    # Get files from last commit
    committed_files = set()
    head_sha = get_head_sha(repo_root)
    if head_sha:
        from objects import read_commit, read_tree

        def get_tree_files(tree_sha: str, prefix: str = '') -> set:
            files = set()
            try:
                tree_entries = read_tree(repo_root, tree_sha)
                for entry in tree_entries:
                    path = f"{prefix}{entry.name}" if prefix else entry.name
                    if entry.mode == '40000':
                        files.update(get_tree_files(entry.sha, path + '/'))
                    else:
                        files.add(path)
            except:
                pass
            return files

        try:
            commit = read_commit(repo_root, head_sha)
            committed_files = get_tree_files(commit['tree'])
        except:
            pass

    all_tracked = tracked_files | committed_files

    # Collect files to add
    files_to_add = []

    if all_flag or update_flag:
        # Walk working directory
        for root, dirs, files in os.walk(repo_root):
            # Skip .minigit directory
            if '.minigit' in dirs:
                dirs.remove('.minigit')

            for file in files:
                abs_path = Path(root) / file
                rel_path = str(abs_path.relative_to(repo_root))

                if all_flag:
                    files_to_add.append(rel_path)
                elif update_flag:
                    if rel_path in all_tracked:
                        files_to_add.append(rel_path)

        # Handle deletions
        if all_flag or update_flag:
            for tracked in all_tracked:
                full_path = repo_root / tracked
                if not full_path.exists():
                    # File was deleted
                    remove_from_index(repo_root, tracked)

    # Add explicit paths
    for path_arg in paths:
        path = Path(path_arg)

        # Handle absolute paths
        if path.is_absolute():
            try:
                path = path.relative_to(repo_root)
            except ValueError:
                print(f"error: '{path_arg}' is outside repository", file=sys.stderr)
                return 1

        full_path = repo_root / path

        if not full_path.exists():
            # Check if it's a tracked file being deleted
            rel_str = str(path)
            if rel_str in all_tracked:
                remove_from_index(repo_root, rel_str)
                continue

            print(f"error: pathspec '{path_arg}' did not match any files", file=sys.stderr)
            return 1

        if full_path.is_file():
            files_to_add.append(str(path))
        elif full_path.is_dir():
            # Add all files in directory
            for root, dirs, files in os.walk(full_path):
                if '.minigit' in dirs:
                    dirs.remove('.minigit')
                for file in files:
                    abs_file = Path(root) / file
                    rel_file = str(abs_file.relative_to(repo_root))
                    files_to_add.append(rel_file)

    # Add files to index
    for rel_path in files_to_add:
        full_path = repo_root / rel_path

        if not full_path.exists():
            continue

        if full_path.is_symlink():
            # Handle symlink
            target = os.readlink(full_path)
            content = target.encode()
            mode = '120000'
        else:
            content = full_path.read_bytes()
            # Check if executable
            stat = full_path.stat()
            if stat.st_mode & 0o111:
                mode = '100755'
            else:
                mode = '100644'

        sha = create_blob(repo_root, content)
        add_to_index(repo_root, rel_path, sha, mode, stat if not full_path.is_symlink() else None)

    return 0
