"""add command - Stage files for commit."""

import sys
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_file_mode
from objects import hash_object
from index import Index, IndexEntry


def run(args):
    """Stage files for commit."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("Nothing specified, nothing added.", file=sys.stderr)
        return 0

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
        elif arg == '.':
            paths.append(repo_root)
        else:
            paths.append(Path.cwd() / arg)
        i += 1

    # Read existing index
    index = Index.read(repo_root)

    # Handle -A flag (stage all changes including deletions)
    if all_flag:
        paths = [repo_root]
        update_flag = False  # -A overrides -u

    # Handle -u flag (only update tracked files)
    if update_flag:
        # Stage modifications and deletions of tracked files
        tracked_files = set(index.entries.keys())
        for name in tracked_files:
            file_path = repo_root / name
            if file_path.exists():
                # File still exists - check if modified
                try:
                    content = file_path.read_bytes()
                    sha = hash_object(content, 'blob', write=True, repo_root=repo_root)
                    entry = IndexEntry.from_file(file_path, sha, repo_root)
                    index.add_entry(entry)
                except Exception as e:
                    print(f"error: {name}: {e}", file=sys.stderr)
            else:
                # File deleted
                index.remove_entry(name)
        index.write(repo_root)
        return 0

    # Collect all files to add
    files_to_add = []
    for path in paths:
        path = Path(path).resolve()

        if not path.exists():
            # Check if it's a tracked file that was deleted
            try:
                rel_path = str(path.relative_to(repo_root))
                if rel_path in index.entries:
                    if all_flag:
                        index.remove_entry(rel_path)
                        continue
                    else:
                        print(f"fatal: pathspec '{args[0]}' did not match any files", file=sys.stderr)
                        return 1
            except ValueError:
                pass
            print(f"fatal: pathspec '{path}' did not match any files", file=sys.stderr)
            return 1

        if path.is_file():
            files_to_add.append(path)
        elif path.is_dir():
            # Recursively add all files in directory
            for file_path in path.rglob('*'):
                if file_path.is_file():
                    # Skip .minigit directory
                    try:
                        rel = file_path.relative_to(repo_root)
                        if '.minigit' in rel.parts:
                            continue
                    except ValueError:
                        continue
                    files_to_add.append(file_path)

            # Also handle deletions if -A flag
            if all_flag:
                existing_files = set()
                for f in path.rglob('*'):
                    if f.is_file():
                        try:
                            rel = str(f.relative_to(repo_root))
                            if '.minigit' not in rel:
                                existing_files.add(rel)
                        except ValueError:
                            pass

                # Find deleted files
                for name in list(index.entries.keys()):
                    file_path = repo_root / name
                    if not file_path.exists():
                        index.remove_entry(name)

    # Add each file to index
    for file_path in files_to_add:
        try:
            # Read file content
            if file_path.is_symlink():
                content = os.readlink(file_path).encode()
            else:
                content = file_path.read_bytes()

            # Hash and store the blob
            sha = hash_object(content, 'blob', write=True, repo_root=repo_root)

            # Create index entry
            entry = IndexEntry.from_file(file_path, sha, repo_root)
            index.add_entry(entry)

        except Exception as e:
            print(f"error: {file_path}: {e}", file=sys.stderr)
            return 1

    # Handle deletions for -A
    if all_flag:
        for name in list(index.entries.keys()):
            file_path = repo_root / name
            if not file_path.exists():
                index.remove_entry(name)

    # Write updated index
    index.write(repo_root)
    return 0
