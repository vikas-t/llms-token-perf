"""tag command - Create, list, or delete tags."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils import find_repo_root, get_minigit_dir
from objects import Tag, write_object, resolve_object
from refs import list_tags, create_tag, delete_tag, resolve_head
from commands.commit import get_author_info


def run(args):
    """Manage tags."""
    repo_root = find_repo_root()
    if repo_root is None:
        print("fatal: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    annotated = False
    delete = False
    list_mode = False
    message = None
    tag_name = None
    commit_ref = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-a':
            annotated = True
        elif arg == '-d':
            delete = True
        elif arg == '-l':
            list_mode = True
        elif arg == '-m' and i + 1 < len(args):
            message = args[i + 1]
            annotated = True  # -m implies -a
            i += 1
        elif not arg.startswith('-'):
            if tag_name is None:
                tag_name = arg
            else:
                commit_ref = arg
        i += 1

    # Handle delete
    if delete:
        if not tag_name:
            print("error: tag name required", file=sys.stderr)
            return 1

        if delete_tag(tag_name, repo_root):
            print(f"Deleted tag '{tag_name}'")
            return 0
        else:
            print(f"error: tag '{tag_name}' not found", file=sys.stderr)
            return 1

    # Handle list
    if list_mode or tag_name is None:
        tags = list_tags(repo_root)
        for tag in tags:
            print(tag)
        return 0

    # Create tag
    # Resolve target commit
    if commit_ref:
        try:
            target_sha = resolve_object(commit_ref, repo_root)
        except ValueError as e:
            print(f"fatal: {e}", file=sys.stderr)
            return 1
    else:
        target_sha = resolve_head(repo_root)
        if not target_sha:
            print("fatal: not a valid object name: 'HEAD'", file=sys.stderr)
            return 1

    if annotated:
        if not message:
            print("error: annotated tag requires a message (-m)", file=sys.stderr)
            return 1

        # Create annotated tag object
        tag = Tag()
        tag.object_sha = target_sha
        tag.object_type = 'commit'
        tag.tag_name = tag_name
        tag.tagger = get_author_info()
        tag.message = message

        tag_data = tag.serialize()
        tag_sha = write_object('tag', tag_data, repo_root)

        # Create tag ref pointing to tag object
        if not create_tag(tag_name, tag_sha, repo_root):
            print(f"fatal: tag '{tag_name}' already exists", file=sys.stderr)
            return 1
    else:
        # Create lightweight tag (just a ref)
        if not create_tag(tag_name, target_sha, repo_root):
            print(f"fatal: tag '{tag_name}' already exists", file=sys.stderr)
            return 1

    return 0
