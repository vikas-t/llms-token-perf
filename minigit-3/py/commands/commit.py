"""commit command - Create a commit."""

import sys
from pathlib import Path


def run(args: list[str]) -> int:
    """Create a new commit."""
    from utils import find_repo_root
    from objects import create_commit, build_tree_from_index, read_commit
    from index import read_index, write_index, add_to_index
    from refs import get_head_sha, update_head_for_commit

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    message = None
    all_flag = False
    amend_flag = False

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '-m' and i + 1 < len(args):
            message = args[i + 1]
            i += 2
        elif arg == '-a':
            all_flag = True
            i += 1
        elif arg == '--amend':
            amend_flag = True
            i += 1
        else:
            i += 1

    if message is None and not amend_flag:
        print("error: must provide commit message with -m", file=sys.stderr)
        return 1

    # Handle -a flag: auto-stage modified tracked files
    if all_flag:
        entries = read_index(repo_root)
        head_sha = get_head_sha(repo_root)

        if head_sha:
            from objects import read_commit as rc, read_tree

            def get_committed_files(tree_sha: str, prefix: str = '') -> dict:
                files = {}
                try:
                    tree_entries = read_tree(repo_root, tree_sha)
                    for entry in tree_entries:
                        path = f"{prefix}{entry.name}" if prefix else entry.name
                        if entry.mode == '40000':
                            files.update(get_committed_files(entry.sha, path + '/'))
                        else:
                            files[path] = entry.sha
                except:
                    pass
                return files

            commit = rc(repo_root, head_sha)
            committed = get_committed_files(commit['tree'])

            from objects import create_blob

            for path, old_sha in committed.items():
                full_path = repo_root / path
                if full_path.exists():
                    content = full_path.read_bytes()
                    stat = full_path.stat()
                    mode = '100755' if stat.st_mode & 0o111 else '100644'
                    new_sha = create_blob(repo_root, content)
                    if new_sha != old_sha:
                        add_to_index(repo_root, path, new_sha, mode, stat)

    # Get index entries
    entries = read_index(repo_root)

    if not entries:
        print("error: nothing to commit", file=sys.stderr)
        return 1

    # Get parent commit
    head_sha = get_head_sha(repo_root)
    parents = []

    if amend_flag and head_sha:
        # Amend: use parent of current HEAD
        commit = read_commit(repo_root, head_sha)
        parents = commit['parents']
        if message is None:
            message = commit['message']
    elif head_sha:
        parents = [head_sha]

    # Check if there are any changes
    if head_sha and not amend_flag:
        from objects import read_tree

        def entries_match_tree(tree_sha: str, entries: list) -> bool:
            """Check if index entries match the tree exactly."""
            def get_tree_entries(sha: str, prefix: str = '') -> dict:
                result = {}
                try:
                    tree_entries = read_tree(repo_root, sha)
                    for entry in tree_entries:
                        path = f"{prefix}{entry.name}" if prefix else entry.name
                        if entry.mode == '40000':
                            result.update(get_tree_entries(entry.sha, path + '/'))
                        else:
                            result[path] = (entry.sha, entry.mode)
                except:
                    pass
                return result

            tree_files = get_tree_entries(tree_sha)
            index_files = {e['path']: (e['sha'], e['mode']) for e in entries}

            return tree_files == index_files

        commit = read_commit(repo_root, head_sha)
        if entries_match_tree(commit['tree'], entries):
            print("error: nothing to commit, working tree clean", file=sys.stderr)
            return 1

    # Build tree from index
    tree_sha = build_tree_from_index(repo_root, entries)

    # Create commit
    commit_sha = create_commit(repo_root, tree_sha, message, parents)

    # Update HEAD
    update_head_for_commit(repo_root, commit_sha)

    # Output commit SHA
    print(f"[{commit_sha[:7]}] {message.split(chr(10))[0]}")

    return 0
