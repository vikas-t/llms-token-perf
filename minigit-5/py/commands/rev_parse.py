"""rev-parse command - Resolve revisions to SHA."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from refs import resolve_revision


def run(args: list[str]) -> int:
    """Resolve revision to SHA."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("fatal: revision required", file=sys.stderr)
        return 1

    revision = args[0]
    sha = resolve_revision(repo_root, revision)

    if sha is None:
        print(f"fatal: ambiguous argument '{revision}'", file=sys.stderr)
        return 1

    print(sha)
    return 0
