"""hash-object command - Compute object hash."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, hash_object_data, write_object


def run(args: list[str]) -> int:
    """Compute hash for a file."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    write_to_db = False
    obj_type = 'blob'
    file_path = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-w':
            write_to_db = True
        elif arg == '-t' and i + 1 < len(args):
            obj_type = args[i + 1]
            i += 1
        elif not arg.startswith('-'):
            file_path = arg
        i += 1

    if file_path is None:
        print("fatal: file path required", file=sys.stderr)
        return 1

    path = Path(file_path)
    if not path.is_absolute():
        path = Path.cwd() / path

    if not path.exists():
        print(f"fatal: cannot open '{file_path}'", file=sys.stderr)
        return 1

    data = path.read_bytes()

    if write_to_db:
        sha = write_object(obj_type, data, repo_root)
    else:
        sha = hash_object_data(obj_type, data)

    print(sha)
    return 0
