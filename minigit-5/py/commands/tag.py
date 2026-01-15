"""tag command - Create, list, or delete tags."""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root
from objects import Tag, Commit
from refs import (
    list_tags, read_ref, write_ref, delete_ref, resolve_head, resolve_revision
)
from commands.commit import format_timestamp


def run(args: list[str]) -> int:
    """Manage tags."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    annotated = False
    delete = False
    list_flag = False
    message = None
    tag_name = None
    target = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-a':
            annotated = True
        elif arg == '-d':
            delete = True
        elif arg in ('-l', '--list'):
            list_flag = True
        elif arg == '-m' and i + 1 < len(args):
            message = args[i + 1]
            annotated = True  # -m implies -a
            i += 1
        elif not arg.startswith('-'):
            if tag_name is None:
                tag_name = arg
            else:
                target = arg
        i += 1

    if delete:
        if not tag_name:
            print("fatal: tag name required", file=sys.stderr)
            return 1
        return delete_tag(repo_root, tag_name)

    if list_flag or tag_name is None:
        return list_tags_cmd(repo_root)

    return create_tag(repo_root, tag_name, target, annotated, message)


def list_tags_cmd(repo_root: Path) -> int:
    """List all tags."""
    tags = list_tags(repo_root)
    for tag in tags:
        print(tag)
    return 0


def create_tag(repo_root: Path, name: str, target: str = None, annotated: bool = False, message: str = None) -> int:
    """Create a new tag."""
    # Check if tag already exists
    if read_ref(repo_root, f'refs/tags/{name}'):
        print(f"fatal: tag '{name}' already exists", file=sys.stderr)
        return 1

    # Resolve target
    if target:
        sha = resolve_revision(repo_root, target)
        if sha is None:
            print(f"fatal: not a valid object name: '{target}'", file=sys.stderr)
            return 1
    else:
        sha = resolve_head(repo_root)
        if sha is None:
            print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
            return 1

    if annotated:
        if not message:
            print("fatal: tag message required (-m)", file=sys.stderr)
            return 1

        # Create annotated tag object
        tagger = os.environ.get('GIT_AUTHOR_NAME', 'Unknown')
        tagger_email = os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com')
        tagger_date = format_timestamp(os.environ.get('GIT_AUTHOR_DATE'))

        tag = Tag(
            object_sha=sha,
            object_type='commit',
            tag_name=name,
            tagger=tagger,
            tagger_email=tagger_email,
            tagger_date=tagger_date,
            message=message
        )
        tag_sha = tag.write(repo_root)
        write_ref(repo_root, f'refs/tags/{name}', tag_sha)
    else:
        # Lightweight tag - just a ref
        write_ref(repo_root, f'refs/tags/{name}', sha)

    return 0


def delete_tag(repo_root: Path, name: str) -> int:
    """Delete a tag."""
    ref_path = f'refs/tags/{name}'
    if not read_ref(repo_root, ref_path):
        print(f"error: tag '{name}' not found", file=sys.stderr)
        return 1

    delete_ref(repo_root, ref_path)
    print(f"Deleted tag '{name}'")
    return 0
