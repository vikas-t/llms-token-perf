"""update-ref command - Update reference."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Update a reference."""
    from utils import find_repo_root
    from refs import write_ref, write_head

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    if len(args) < 2:
        print("error: ref and sha required", file=sys.stderr)
        return 1

    ref = args[0]
    sha = args[1]

    # Validate SHA format (should be 40 hex chars)
    if len(sha) != 40 or not all(c in '0123456789abcdef' for c in sha):
        print(f"error: invalid SHA: '{sha}'", file=sys.stderr)
        return 1

    if ref == 'HEAD':
        write_head(repo_root, sha)
    else:
        write_ref(repo_root, ref, sha)

    return 0
