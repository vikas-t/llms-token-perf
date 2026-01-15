"""init command - Initialize repository."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Initialize a new repository."""
    # Parse arguments
    if args:
        target_dir = Path(args[0])
    else:
        target_dir = Path.cwd()

    target_dir = target_dir.resolve()
    minigit_dir = target_dir / '.minigit'

    # Check if already exists
    if minigit_dir.exists():
        print(f"error: repository already exists at {minigit_dir}", file=sys.stderr)
        return 1

    # Create directory structure
    try:
        minigit_dir.mkdir(parents=True)
        (minigit_dir / 'objects').mkdir()
        (minigit_dir / 'objects' / 'info').mkdir()
        (minigit_dir / 'objects' / 'pack').mkdir()
        (minigit_dir / 'refs').mkdir()
        (minigit_dir / 'refs' / 'heads').mkdir()
        (minigit_dir / 'refs' / 'tags').mkdir()

        # Create HEAD
        (minigit_dir / 'HEAD').write_text('ref: refs/heads/main\n')

        # Create config
        (minigit_dir / 'config').write_text('')

        print(f"Initialized empty minigit repository in {minigit_dir}")
        return 0

    except Exception as e:
        print(f"error: failed to initialize repository: {e}", file=sys.stderr)
        return 1
