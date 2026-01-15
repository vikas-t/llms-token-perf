"""ls-files command - List indexed files."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """List indexed files."""
    from utils import find_repo_root
    from index import read_index

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    staged = '--staged' in args or '--stage' in args or '-s' in args

    entries = read_index(repo_root)

    for entry in sorted(entries, key=lambda e: e['path']):
        if staged:
            # Format: mode sha stage path
            mode = entry['mode']
            sha = entry['sha']
            stage = 0  # Normal stage
            print(f"{mode} {sha} {stage}\t{entry['path']}")
        else:
            print(entry['path'])

    return 0
