"""init command - Initialize a new repository."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Initialize a new minigit repository."""
    if args:
        target_dir = Path(args[0])
    else:
        target_dir = Path.cwd()

    target_dir = target_dir.resolve()
    git_dir = target_dir / '.minigit'

    if git_dir.exists():
        print(f"fatal: already a minigit repository: {target_dir}", file=sys.stderr)
        return 1

    # Create directory structure
    git_dir.mkdir(parents=True)
    (git_dir / 'objects').mkdir()
    (git_dir / 'objects' / 'info').mkdir()
    (git_dir / 'objects' / 'pack').mkdir()
    (git_dir / 'refs').mkdir()
    (git_dir / 'refs' / 'heads').mkdir()
    (git_dir / 'refs' / 'tags').mkdir()

    # Create HEAD
    (git_dir / 'HEAD').write_text('ref: refs/heads/main\n')

    # Create empty config
    (git_dir / 'config').write_text('')

    print(f"Initialized empty minigit repository in {git_dir}")
    return 0
