"""rev-parse command - Resolve revisions."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Resolve revision to SHA."""
    from utils import find_repo_root
    from refs import resolve_ref

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("error: revision required", file=sys.stderr)
        return 1

    target = args[0]

    sha = resolve_ref(repo_root, target)
    if sha is None:
        print(f"error: unknown revision '{target}'", file=sys.stderr)
        return 1

    print(sha)
    return 0
