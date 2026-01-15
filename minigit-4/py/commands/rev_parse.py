"""rev-parse command - Resolve revision to SHA."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import resolve_object


def run(args):
    """Resolve revision to SHA."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("fatal: no revision specified", file=sys.stderr)
        return 1

    for arg in args:
        if arg.startswith('-'):
            # Skip flags for now
            continue

        try:
            sha = resolve_object(arg, repo_root)
            print(sha)
        except ValueError as e:
            print(f"fatal: ambiguous argument '{arg}': unknown revision", file=sys.stderr)
            return 1

    return 0
