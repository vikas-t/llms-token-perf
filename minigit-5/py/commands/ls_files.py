"""ls-files command - List indexed files."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from index import Index


def run(args: list[str]) -> int:
    """List files in the index."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    staged = '--staged' in args or '-s' in args
    cached = '--cached' in args

    index = Index.read(repo_root)

    for entry in index.get_all_entries():
        if staged or cached:
            # Format: mode sha stage path
            stage = 0  # We don't track merge stages
            print(f"{entry.mode:06o} {entry.sha} {stage}\t{entry.name}")
        else:
            print(entry.name)

    return 0
