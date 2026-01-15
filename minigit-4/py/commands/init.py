"""init command - Initialize a new repository."""

import sys
from pathlib import Path


def run(args):
    """Initialize a new Mini Git repository."""
    # Parse directory argument
    if args:
        target_dir = Path(args[0])
    else:
        target_dir = Path.cwd()

    target_dir = target_dir.resolve()

    # Create .minigit directory structure
    minigit_dir = target_dir / '.minigit'

    if minigit_dir.exists():
        print(f"error: repository already exists at {target_dir}", file=sys.stderr)
        return 1

    try:
        # Create directory structure
        minigit_dir.mkdir(parents=True)
        (minigit_dir / 'objects').mkdir()
        (minigit_dir / 'objects' / 'pack').mkdir()
        (minigit_dir / 'objects' / 'info').mkdir()
        (minigit_dir / 'refs').mkdir()
        (minigit_dir / 'refs' / 'heads').mkdir()
        (minigit_dir / 'refs' / 'tags').mkdir()

        # Create HEAD pointing to main
        (minigit_dir / 'HEAD').write_text('ref: refs/heads/main\n')

        # Create empty config
        (minigit_dir / 'config').write_text('')

        print(f"Initialized empty minigit repository in {minigit_dir}")
        return 0

    except Exception as e:
        print(f"error: failed to initialize repository: {e}", file=sys.stderr)
        return 1
