"""symbolic-ref command - Manage symbolic references."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from refs import read_head, write_head, get_head_ref


def run(args: list[str]) -> int:
    """Read or update symbolic reference."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("usage: minigit symbolic-ref <name> [<ref>]", file=sys.stderr)
        return 1

    ref_name = args[0]

    if len(args) == 1:
        # Read mode
        if ref_name == 'HEAD':
            head_ref = get_head_ref(repo_root)
            if head_ref:
                print(head_ref)
                return 0
            else:
                # HEAD is detached
                print("fatal: ref HEAD is not a symbolic ref", file=sys.stderr)
                return 1
        else:
            print(f"fatal: unknown symbolic ref: {ref_name}", file=sys.stderr)
            return 1
    else:
        # Write mode
        target = args[1]

        if ref_name == 'HEAD':
            write_head(repo_root, f'ref: {target}')
            return 0
        else:
            # For other symbolic refs, we'd need to implement this
            print(f"fatal: symbolic ref update for {ref_name} not supported", file=sys.stderr)
            return 1
