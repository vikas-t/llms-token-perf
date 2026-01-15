"""ls-files command - List indexed files."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from index import Index


def run(args):
    """List indexed files."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    staged = False

    for arg in args:
        if arg in ('--stage', '--staged', '-s'):
            staged = True

    # Read index
    index = Index.read(repo_root)

    for entry in index.get_sorted_entries():
        if staged:
            mode_str = f'{entry.mode:o}'
            # Stage is always 0 for normal entries
            print(f'{mode_str} {entry.sha} 0\t{entry.name}')
        else:
            print(entry.name)

    return 0
