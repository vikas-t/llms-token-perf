"""update-ref command - Update a reference."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from refs import set_ref


def run(args):
    """Update a reference."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if len(args) < 2:
        print("usage: minigit update-ref <ref> <sha>", file=sys.stderr)
        return 1

    ref_name = args[0]
    sha = args[1]

    # Validate SHA format
    if len(sha) < 4 or not all(c in '0123456789abcdef' for c in sha):
        print(f"fatal: invalid sha: {sha}", file=sys.stderr)
        return 1

    set_ref(ref_name, sha, repo_root)
    return 0
