"""checkout command - Switch branches or restore files."""

import sys
import os
from pathlib import Path


def run(args: list[str]) -> int:
    """Switch branches or restore files."""
    from utils import find_repo_root
    from refs import (resolve_ref, get_head_sha, get_current_branch,
                     write_head, read_ref, write_ref)
    from objects import read_commit, read_tree, read_blob
    from index import read_index, write_index, add_to_index

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    create_branch = False
    target = None
    files = []
    commit_for_files = None

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-b':
            create_branch = True
            if i + 1 < len(args):
                target = args[i + 1]
                i += 1
                # Check for optional start point
                if i + 1 < len(args) and not args[i + 1].startswith('-') and args[i + 1] != '--':
                    commit_for_files = args[i + 1]
                    i += 1
        elif arg == '--':
            files.extend(args[i + 1:])
            break
        elif not arg.startswith('-'):
            if target is None:
                target = arg
            else:
                files.append(arg)
        i += 1

    if target is None and not files:
        print("error: nothing to checkout", file=sys.stderr)
        return 1

    # Handle file restore
    if files or (target and '--' in args):
        # Restore files from index or commit
        if target and target != '--':
            # Restore from specific commit
            sha = resolve_ref(repo_root, target)
            if sha is None:
                print(f"error: pathspec '{target}' did not match any file(s)", file=sys.stderr)
                return 1

            commit = read_commit(repo_root, sha)
            tree_sha = commit['tree']
        else:
            # Restore from index
            tree_sha = None

        if not files and target and '--' not in args:
            # target might be a file path, not a ref
            sha = resolve_ref(repo_root, target)
            if sha is None:
                files = [target]
                tree_sha = None

        for file_path in files:
            full_path = repo_root / file_path

            if tree_sha:
                # Restore from tree
                entry = get_tree_entry(repo_root, tree_sha, file_path)
                if entry is None:
                    print(f"error: pathspec '{file_path}' did not match any file(s)", file=sys.stderr)
                    return 1

                content = read_blob(repo_root, entry.sha)
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_bytes(content)

                # Update index
                add_to_index(repo_root, file_path, entry.sha, entry.mode)
            else:
                # Restore from index
                entries = {e['path']: e for e in read_index(repo_root)}
                if file_path not in entries:
                    print(f"error: pathspec '{file_path}' did not match any file(s)", file=sys.stderr)
                    return 1

                entry = entries[file_path]
                content = read_blob(repo_root, entry['sha'])
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_bytes(content)

        return 0

    # Handle branch checkout/create
    if create_branch:
        # Create new branch and switch to it
        from refs import list_branches

        if target in list_branches(repo_root):
            print(f"error: branch '{target}' already exists", file=sys.stderr)
            return 1

        if commit_for_files:
            sha = resolve_ref(repo_root, commit_for_files)
            if sha is None:
                print(f"error: not a valid revision: '{commit_for_files}'", file=sys.stderr)
                return 1
        else:
            sha = get_head_sha(repo_root)
            if sha is None:
                print("error: no commits yet", file=sys.stderr)
                return 1

        write_ref(repo_root, f'refs/heads/{target}', sha)
        write_head(repo_root, f'ref: refs/heads/{target}')

        # Update working tree if switching to different commit
        if commit_for_files:
            return update_working_tree(repo_root, sha)

        print(f"Switched to a new branch '{target}'")
        return 0

    # Try to resolve target as ref first, then as SHA
    is_branch = read_ref(repo_root, f'refs/heads/{target}') is not None
    sha = resolve_ref(repo_root, target)

    if sha is None:
        # Maybe it's a file path?
        if (repo_root / target).exists() or target in [e['path'] for e in read_index(repo_root)]:
            files = [target]
            # Restore from index
            entries = {e['path']: e for e in read_index(repo_root)}
            if target in entries:
                entry = entries[target]
                content = read_blob(repo_root, entry['sha'])
                (repo_root / target).write_bytes(content)
                return 0

        print(f"error: pathspec '{target}' did not match any file(s)", file=sys.stderr)
        return 1

    # Check for uncommitted changes that would be overwritten
    head_sha = get_head_sha(repo_root)
    if head_sha and head_sha != sha:
        if has_conflicting_changes(repo_root, head_sha, sha):
            print("error: Your local changes would be overwritten by checkout.", file=sys.stderr)
            print("Please commit or stash them first.", file=sys.stderr)
            return 1

    # Update HEAD
    if is_branch:
        write_head(repo_root, f'ref: refs/heads/{target}')
        print(f"Switched to branch '{target}'")
    else:
        write_head(repo_root, sha)
        print(f"HEAD is now at {sha[:7]}")

    # Update working tree
    return update_working_tree(repo_root, sha)


def get_tree_entry(repo_root, tree_sha: str, path: str):
    """Get entry from tree by path."""
    from objects import read_tree, TreeEntry

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


def has_conflicting_changes(repo_root, old_sha: str, new_sha: str) -> bool:
    """Check if working tree has changes that conflict with checkout."""
    from objects import read_commit, read_tree, read_blob
    from index import read_index
    from utils import hash_object_data

    # Get index
    index_entries = {e['path']: e for e in read_index(repo_root)}

    # Get old and new trees
    def get_tree_files(tree_sha: str, prefix: str = '') -> dict:
        files = {}
        try:
            tree_entries = read_tree(repo_root, tree_sha)
            for entry in tree_entries:
                path = f"{prefix}{entry.name}" if prefix else entry.name
                if entry.mode == '40000':
                    files.update(get_tree_files(entry.sha, path + '/'))
                else:
                    files[path] = entry.sha
        except:
            pass
        return files

    old_commit = read_commit(repo_root, old_sha)
    new_commit = read_commit(repo_root, new_sha)

    old_files = get_tree_files(old_commit['tree'])
    new_files = get_tree_files(new_commit['tree'])

    # Check for modified files that differ between old and new
    for path, old_blob_sha in old_files.items():
        new_blob_sha = new_files.get(path)

        if old_blob_sha != new_blob_sha:
            # File differs between old and new
            # Check if working tree has modifications
            full_path = repo_root / path
            if full_path.exists():
                content = full_path.read_bytes()
                current_sha = hash_object_data('blob', content)
                if current_sha != old_blob_sha:
                    # Working tree modified, and target is different
                    return True

    return False


def update_working_tree(repo_root, target_sha: str) -> int:
    """Update working tree and index to match target commit."""
    from objects import read_commit, read_tree, read_blob
    from index import read_index, write_index

    commit = read_commit(repo_root, target_sha)
    tree_sha = commit['tree']

    # Get all files from target tree
    def get_tree_files(tree_sha: str, prefix: str = '') -> dict:
        files = {}
        try:
            tree_entries = read_tree(repo_root, tree_sha)
            for entry in tree_entries:
                path = f"{prefix}{entry.name}" if prefix else entry.name
                if entry.mode == '40000':
                    files.update(get_tree_files(entry.sha, path + '/'))
                else:
                    files[path] = {'sha': entry.sha, 'mode': entry.mode}
        except:
            pass
        return files

    target_files = get_tree_files(tree_sha)

    # Get current index
    index_entries = {e['path']: e for e in read_index(repo_root)}

    # Remove files not in target
    for path in list(index_entries.keys()):
        if path not in target_files:
            full_path = repo_root / path
            if full_path.exists():
                full_path.unlink()
                # Remove empty parent directories
                try:
                    parent = full_path.parent
                    while parent != repo_root:
                        if not any(parent.iterdir()):
                            parent.rmdir()
                            parent = parent.parent
                        else:
                            break
                except:
                    pass

    # Add/update files from target
    new_entries = []
    for path, info in target_files.items():
        full_path = repo_root / path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        content = read_blob(repo_root, info['sha'])
        full_path.write_bytes(content)

        # Set executable bit if needed
        if info['mode'] == '100755':
            full_path.chmod(0o755)

        stat = full_path.stat()
        new_entries.append({
            'path': path,
            'sha': info['sha'],
            'mode': info['mode'],
            'ctime': (int(stat.st_ctime), int((stat.st_ctime % 1) * 1e9)),
            'mtime': (int(stat.st_mtime), int((stat.st_mtime % 1) * 1e9)),
            'dev': stat.st_dev,
            'ino': stat.st_ino,
            'uid': stat.st_uid,
            'gid': stat.st_gid,
            'size': stat.st_size,
            'flags': min(len(path), 0xFFF)
        })

    write_index(repo_root, new_entries)
    return 0
