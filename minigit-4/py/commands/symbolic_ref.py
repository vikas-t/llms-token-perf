"""symbolic-ref command - Manage symbolic references."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from refs import get_head, set_head


def run(args):
    """Read or update symbolic reference."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("usage: minigit symbolic-ref <ref> [<target>]", file=sys.stderr)
        return 1

    ref_name = args[0]

    if len(args) == 1:
        # Read mode
        if ref_name == 'HEAD':
            ref, is_symbolic = get_head(repo_root)
            if is_symbolic:
                print(ref)
                return 0
            else:
                print(f"fatal: ref HEAD is not a symbolic ref", file=sys.stderr)
                return 1
        else:
            # Check other refs
            minigit_dir = get_minigit_dir(repo_root)
            ref_path = minigit_dir / ref_name
            if ref_path.exists():
                content = ref_path.read_text().strip()
                if content.startswith('ref: '):
                    print(content[5:])
                    return 0
            print(f"fatal: ref {ref_name} is not a symbolic ref", file=sys.stderr)
            return 1
    else:
        # Write mode
        target = args[1]

        if ref_name == 'HEAD':
            set_head(target, symbolic=True, repo_root=repo_root)
            return 0
        else:
            minigit_dir = get_minigit_dir(repo_root)
            ref_path = minigit_dir / ref_name
            ref_path.parent.mkdir(parents=True, exist_ok=True)
            ref_path.write_text(f'ref: {target}\n')
            return 0
