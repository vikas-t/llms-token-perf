"""hash-object command - Compute object hash."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Compute object hash."""
    from utils import find_repo_root, hash_object_data, write_object

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    write = False
    obj_type = 'blob'
    file_path = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-w':
            write = True
        elif arg == '-t' and i + 1 < len(args):
            obj_type = args[i + 1]
            i += 1
        elif not arg.startswith('-'):
            file_path = arg
        i += 1

    if file_path is None:
        print("error: file required", file=sys.stderr)
        return 1

    # Read file
    path = Path(file_path)
    if path.is_absolute():
        full_path = path
    else:
        full_path = repo_root / path

    if not full_path.exists():
        print(f"error: file '{file_path}' not found", file=sys.stderr)
        return 1

    content = full_path.read_bytes()

    if write:
        sha = write_object(repo_root, obj_type, content)
    else:
        sha = hash_object_data(obj_type, content)

    print(sha)
    return 0
