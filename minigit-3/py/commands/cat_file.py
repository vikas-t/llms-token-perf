"""cat-file command - Examine objects."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Examine object internals."""
    from utils import find_repo_root, read_object
    from refs import resolve_ref
    from objects import read_commit, read_tree, read_tag

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    show_type = False
    show_size = False
    pretty_print = False
    obj_type_filter = None
    target = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-t':
            show_type = True
        elif arg == '-s':
            show_size = True
        elif arg == '-p':
            pretty_print = True
        elif arg in ('blob', 'tree', 'commit', 'tag'):
            obj_type_filter = arg
            if i + 1 < len(args):
                target = args[i + 1]
                i += 1
        elif not arg.startswith('-'):
            target = arg
        i += 1

    if target is None:
        print("error: object required", file=sys.stderr)
        return 1

    # Handle path specifier (e.g., HEAD:file.txt)
    if ':' in target:
        ref_part, path = target.split(':', 1)
        ref_sha = resolve_ref(repo_root, ref_part)
        if ref_sha is None:
            print(f"error: unknown revision '{ref_part}'", file=sys.stderr)
            return 1

        # Get the blob SHA for the file
        commit = read_commit(repo_root, ref_sha)
        entry = get_tree_entry(repo_root, commit['tree'], path)
        if entry is None:
            print(f"error: path '{path}' not found in '{ref_part}'", file=sys.stderr)
            return 1
        target = entry.sha

    # Handle ^{tree} specifier
    elif '^{' in target:
        base, spec = target.split('^{')
        spec = spec.rstrip('}')
        sha = resolve_ref(repo_root, base)
        if sha is None:
            print(f"error: unknown revision '{base}'", file=sys.stderr)
            return 1

        if spec == 'tree':
            commit = read_commit(repo_root, sha)
            target = commit['tree']
        elif spec == 'commit':
            target = sha
        else:
            target = sha
    else:
        # Resolve the reference
        sha = resolve_ref(repo_root, target)
        if sha is None:
            print(f"error: not a valid object name '{target}'", file=sys.stderr)
            return 1
        target = sha

    # Read object
    try:
        obj_type, data = read_object(repo_root, target)
    except Exception as e:
        print(f"error: object '{target}' not found", file=sys.stderr)
        return 1

    # Check type filter
    if obj_type_filter and obj_type != obj_type_filter:
        print(f"error: object type mismatch: expected {obj_type_filter}, got {obj_type}", file=sys.stderr)
        return 1

    if show_type:
        print(obj_type)
    elif show_size:
        print(len(data))
    elif pretty_print or obj_type_filter:
        if obj_type == 'blob':
            try:
                print(data.decode(), end='')
            except:
                sys.stdout.buffer.write(data)
        elif obj_type == 'tree':
            entries = read_tree(repo_root, target)
            for entry in entries:
                type_name = 'tree' if entry.mode == '40000' else 'blob'
                print(f"{entry.mode} {type_name} {entry.sha}\t{entry.name}")
        elif obj_type == 'commit':
            commit = read_commit(repo_root, target)
            print(f"tree {commit['tree']}")
            for parent in commit['parents']:
                print(f"parent {parent}")
            print(f"author {commit['author']}")
            print(f"committer {commit['committer']}")
            print()
            print(commit['message'])
        elif obj_type == 'tag':
            tag = read_tag(repo_root, target)
            print(f"object {tag['object']}")
            print(f"type {tag['type']}")
            print(f"tag {tag['tag']}")
            print(f"tagger {tag['tagger']}")
            print()
            print(tag['message'])
    else:
        # Raw output
        try:
            print(data.decode(), end='')
        except:
            sys.stdout.buffer.write(data)

    return 0


def get_tree_entry(repo_root, tree_sha: str, path: str):
    """Get entry from tree by path."""
    from objects import read_tree

    parts = path.split('/')
    current_sha = tree_sha

    for i, part in enumerate(parts):
        entries = read_tree(repo_root, current_sha)
        found = None
        for entry in entries:
            if entry.name == part:
                found = entry
                break

        if found is None:
            return None

        if i < len(parts) - 1:
            if found.mode != '40000':
                return None
            current_sha = found.sha
        else:
            return found

    return None
