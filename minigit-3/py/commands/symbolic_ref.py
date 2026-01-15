"""symbolic-ref command - Manage symbolic refs."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Read or update symbolic reference."""
    from utils import find_repo_root
    from refs import read_head, write_head, get_head_ref

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    if not args:
        print("error: ref required", file=sys.stderr)
        return 1

    ref = args[0]

    if len(args) >= 2:
        # Set symbolic ref
        target = args[1]
        if ref == 'HEAD':
            write_head(repo_root, f'ref: {target}')
        else:
            # For other refs, write as symbolic ref
            ref_path = repo_root / '.minigit' / ref
            ref_path.parent.mkdir(parents=True, exist_ok=True)
            ref_path.write_text(f'ref: {target}\n')
        return 0
    else:
        # Read symbolic ref
        if ref == 'HEAD':
            head_ref = get_head_ref(repo_root)
            if head_ref:
                print(head_ref)
                return 0
            else:
                print("error: HEAD is not a symbolic ref", file=sys.stderr)
                return 1
        else:
            ref_path = repo_root / '.minigit' / ref
            if ref_path.exists():
                content = ref_path.read_text().strip()
                if content.startswith('ref: '):
                    print(content[5:])
                    return 0
                else:
                    print(f"error: {ref} is not a symbolic ref", file=sys.stderr)
                    return 1
            else:
                print(f"error: ref '{ref}' not found", file=sys.stderr)
                return 1
