"""merge command - Merge branches."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Merge branch into current branch."""
    from utils import find_repo_root
    from refs import (resolve_ref, get_head_sha, get_current_branch,
                     update_head_for_commit, read_ref)
    from objects import read_commit, create_commit, read_tree, read_blob, create_blob
    from index import read_index, write_index, add_to_index
    from merge_algo import find_common_ancestor, merge_trees

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    no_commit = False
    abort = False
    target = None

    for arg in args:
        if arg == '--no-commit':
            no_commit = True
        elif arg == '--abort':
            abort = True
        elif not arg.startswith('-'):
            target = arg

    # Handle abort
    if abort:
        merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
        if merge_head.exists():
            merge_head.unlink()
            # Reset to HEAD
            head_sha = get_head_sha(repo_root)
            if head_sha:
                from commands.checkout import update_working_tree
                update_working_tree(repo_root, head_sha)
            print("Merge aborted")
            return 0
        else:
            print("error: no merge in progress", file=sys.stderr)
            return 1

    if target is None:
        print("error: no branch specified to merge", file=sys.stderr)
        return 1

    # Resolve target
    target_sha = resolve_ref(repo_root, target)
    if target_sha is None:
        print(f"error: branch '{target}' not found", file=sys.stderr)
        return 1

    head_sha = get_head_sha(repo_root)
    if head_sha is None:
        print("error: no commits on current branch", file=sys.stderr)
        return 1

    # Check if already up-to-date
    if head_sha == target_sha:
        print("Already up to date.")
        return 0

    # Find common ancestor
    base_sha = find_common_ancestor(repo_root, head_sha, target_sha)

    # Check for fast-forward
    if base_sha == head_sha:
        if no_commit:
            # For --no-commit with fast-forward, stage the changes but don't move HEAD
            # Update working tree and index to match target
            from commands.checkout import update_working_tree
            update_working_tree(repo_root, target_sha)

            # Write MERGE_HEAD for later commit
            merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
            merge_head.write_text(target_sha + '\n')

            print(f"Automatic merge went well; stopped before committing as requested")
            return 0
        else:
            # Fast-forward merge
            update_head_for_commit(repo_root, target_sha)

            # Update working tree
            from commands.checkout import update_working_tree
            update_working_tree(repo_root, target_sha)

            print(f"Fast-forward merge to {target_sha[:7]}")
            return 0

    # Check if already merged
    if base_sha == target_sha:
        print("Already up to date.")
        return 0

    # Three-way merge
    head_commit = read_commit(repo_root, head_sha)
    target_commit = read_commit(repo_root, target_sha)

    base_tree = None
    if base_sha:
        base_commit = read_commit(repo_root, base_sha)
        base_tree = base_commit['tree']

    # Get current branch name for labels
    current_branch = get_current_branch(repo_root) or 'HEAD'

    # Merge trees
    merged, has_conflicts = merge_trees(
        repo_root,
        base_tree,
        head_commit['tree'],
        target_commit['tree'],
        current_branch,
        target
    )

    # Update working tree and index
    new_entries = []

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

    # Start with files from HEAD
    head_files = get_tree_files(head_commit['tree'])

    for path, info in merged.items():
        full_path = repo_root / path
        full_path.parent.mkdir(parents=True, exist_ok=True)

        if 'conflict' in info and info['conflict']:
            # Write conflict content
            if 'content' in info:
                full_path.write_text(info['content'])
            else:
                # Binary conflict - keep ours
                if 'ours_sha' in info:
                    content = read_blob(repo_root, info['ours_sha'])
                    full_path.write_bytes(content)

            # Don't add to index (leave as conflicted)
            # But we need to keep track of it somehow
            stat = full_path.stat()
            new_entries.append({
                'path': path,
                'sha': head_files.get(path, {}).get('sha', '0' * 40),
                'mode': info.get('mode', '100644'),
                'ctime': (int(stat.st_ctime), int((stat.st_ctime % 1) * 1e9)),
                'mtime': (int(stat.st_mtime), int((stat.st_mtime % 1) * 1e9)),
                'dev': stat.st_dev,
                'ino': stat.st_ino,
                'uid': stat.st_uid,
                'gid': stat.st_gid,
                'size': stat.st_size,
                'flags': min(len(path), 0xFFF)
            })
        else:
            # Write merged content
            content = read_blob(repo_root, info['sha'])
            full_path.write_bytes(content)

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

    # Remove files not in merged result
    for path in head_files:
        if path not in merged:
            full_path = repo_root / path
            if full_path.exists():
                full_path.unlink()

    write_index(repo_root, new_entries)

    if has_conflicts:
        # Write MERGE_HEAD for --abort
        merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
        merge_head.write_text(target_sha + '\n')

        print(f"Automatic merge failed; fix conflicts and then commit the result.")
        return 1

    if no_commit:
        # Write MERGE_HEAD for later commit
        merge_head = repo_root / '.minigit' / 'MERGE_HEAD'
        merge_head.write_text(target_sha + '\n')

        print(f"Automatic merge went well; stopped before committing as requested")
        return 0

    # Create merge commit
    from objects import build_tree_from_index

    tree_sha = build_tree_from_index(repo_root, new_entries)
    message = f"Merge branch '{target}'"

    commit_sha = create_commit(
        repo_root, tree_sha, message,
        parents=[head_sha, target_sha]
    )

    update_head_for_commit(repo_root, commit_sha)

    print(f"Merge made by the 'recursive' strategy.")
    return 0
