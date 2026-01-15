"""add command - Stage files for commit."""

import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_file_mode
from objects import Blob
from index import Index, create_entry_from_file


def run(args: list[str]) -> int:
    """Stage files for commit."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("fatal: nothing specified, nothing added", file=sys.stderr)
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
        elif arg == '--':
            paths.extend(args[i + 1:])
            break
        else:
            paths.append(arg)
        i += 1

    index = Index.read(repo_root)

    if all_flag or update_flag:
        # Handle -A and -u flags
        return handle_auto_add(repo_root, index, all_flag, update_flag)

    # Add specified paths
    for path_str in paths:
        path = Path(path_str)
        if not path.is_absolute():
            path = Path.cwd() / path

        if not path.exists():
            print(f"fatal: pathspec '{path_str}' did not match any files", file=sys.stderr)
            return 1

        if path.is_file():
            add_file(repo_root, index, path)
        elif path.is_dir():
            add_directory(repo_root, index, path)

    index.write(repo_root)
    return 0


def add_file(repo_root: Path, index: Index, file_path: Path):
    """Add a single file to the index."""
    try:
        rel_path = file_path.resolve().relative_to(repo_root.resolve())
    except ValueError:
        return

    rel_path_str = str(rel_path).replace(os.sep, '/')

    # Skip .minigit directory
    if '.minigit' in rel_path.parts:
        return

    # Read file and create blob
    if file_path.is_symlink():
        # For symlinks, store the target path
        content = os.readlink(file_path).encode()
        mode = 0o120000
    else:
        content = file_path.read_bytes()
        mode = get_file_mode(file_path)

    blob = Blob(content)
    blob.write(repo_root)

    # Create index entry
    entry = create_entry_from_file(file_path, rel_path_str, blob.sha, mode)
    index.add_entry(entry)


def add_directory(repo_root: Path, index: Index, dir_path: Path):
    """Recursively add a directory to the index."""
    for item in dir_path.rglob('*'):
        if item.is_file() and '.minigit' not in item.parts:
            add_file(repo_root, index, item)


def handle_auto_add(repo_root: Path, index: Index, all_flag: bool, update_flag: bool) -> int:
    """Handle -A and -u flags."""
    # Get currently tracked files
    tracked_files = set(index.entries.keys())

    # Get all files in working directory
    work_files = set()
    for item in repo_root.rglob('*'):
        if item.is_file() and '.minigit' not in item.parts:
            try:
                rel_path = item.relative_to(repo_root)
                work_files.add(str(rel_path).replace(os.sep, '/'))
            except ValueError:
                pass

    if all_flag:
        # Stage all changes: new, modified, deleted
        # Add/update existing files
        for rel_path_str in work_files:
            file_path = repo_root / rel_path_str
            add_file(repo_root, index, file_path)

        # Remove deleted files from index
        for tracked in tracked_files:
            if tracked not in work_files:
                index.remove_entry(tracked)

    elif update_flag:
        # Only update tracked files (modified and deleted, not new)
        for tracked in tracked_files:
            file_path = repo_root / tracked
            if file_path.exists():
                add_file(repo_root, index, file_path)
            else:
                index.remove_entry(tracked)

    index.write(repo_root)
    return 0
