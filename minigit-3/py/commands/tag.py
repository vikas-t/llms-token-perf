"""tag command - Manage tags."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Create, list, or delete tags."""
    from utils import find_repo_root
    from refs import (list_tags, read_ref, write_ref, delete_ref,
                     resolve_ref, get_head_sha)
    from objects import create_tag

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    annotated = False
    delete = False
    list_flag = False
    message = None
    tag_name = None
    commit = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-a':
            annotated = True
        elif arg == '-d':
            delete = True
        elif arg == '-l':
            list_flag = True
        elif arg == '-m' and i + 1 < len(args):
            message = args[i + 1]
            annotated = True
            i += 1
        elif not arg.startswith('-'):
            if tag_name is None:
                tag_name = arg
            else:
                commit = arg
        i += 1

    # Handle list
    if list_flag or (not tag_name and not delete):
        tags = list_tags(repo_root)
        for tag in sorted(tags):
            print(tag)
        return 0

    # Handle delete
    if delete:
        if not tag_name:
            print("error: tag name required", file=sys.stderr)
            return 1

        sha = read_ref(repo_root, f'refs/tags/{tag_name}')
        if not sha:
            print(f"error: tag '{tag_name}' not found", file=sys.stderr)
            return 1

        delete_ref(repo_root, f'refs/tags/{tag_name}')
        print(f"Deleted tag '{tag_name}'")
        return 0

    # Handle create
    if not tag_name:
        print("error: tag name required", file=sys.stderr)
        return 1

    # Check if tag already exists
    existing = read_ref(repo_root, f'refs/tags/{tag_name}')
    if existing:
        print(f"error: tag '{tag_name}' already exists", file=sys.stderr)
        return 1

    # Resolve commit
    if commit:
        target_sha = resolve_ref(repo_root, commit)
        if not target_sha:
            print(f"error: not a valid revision: '{commit}'", file=sys.stderr)
            return 1
    else:
        target_sha = get_head_sha(repo_root)
        if not target_sha:
            print("error: no commits yet", file=sys.stderr)
            return 1

    if annotated:
        if not message:
            print("error: annotated tags require a message (-m)", file=sys.stderr)
            return 1

        # Create annotated tag object
        tag_sha = create_tag(repo_root, tag_name, target_sha, message)
        write_ref(repo_root, f'refs/tags/{tag_name}', tag_sha)
    else:
        # Create lightweight tag (just a ref)
        write_ref(repo_root, f'refs/tags/{tag_name}', target_sha)

    return 0
