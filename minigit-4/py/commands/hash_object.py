"""hash-object command - Compute object hash."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import hash_object


def run(args):
    """Compute object hash."""
    # Parse arguments
    write = False
    obj_type = 'blob'
    files = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-w':
            write = True
        elif arg == '-t' and i + 1 < len(args):
            obj_type = args[i + 1]
            i += 1
        elif not arg.startswith('-'):
            files.append(arg)
        i += 1

    if not files:
        print("fatal: no files specified", file=sys.stderr)
        return 1

    repo_root = None
    if write:
        repo_root = find_repo_root()
        if repo_root is None:
            print("fatal: not a minigit repository", file=sys.stderr)
            return 1

    for file_path in files:
        try:
            content = Path(file_path).read_bytes()
            sha = hash_object(content, obj_type, write=write, repo_root=repo_root)
            print(sha)
        except FileNotFoundError:
            print(f"fatal: could not open '{file_path}'", file=sys.stderr)
            return 1

    return 0
