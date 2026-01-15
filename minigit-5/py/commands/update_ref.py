"""update-ref command - Update references."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from refs import write_ref, resolve_revision


def run(args: list[str]) -> int:
    """Update a reference."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if len(args) < 2:
        print("usage: minigit update-ref <ref> <sha>", file=sys.stderr)
        return 1

    ref_name = args[0]
    new_value = args[1]

    # Resolve the new value to a full SHA
    sha = resolve_revision(repo_root, new_value)
    if sha is None:
        print(f"fatal: not a valid SHA: {new_value}", file=sys.stderr)
        return 1

    # Handle special refs
    if ref_name == 'HEAD':
        from refs import write_head
        write_head(repo_root, sha)
    else:
        write_ref(repo_root, ref_name, sha)

    return 0
