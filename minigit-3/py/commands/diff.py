"""diff command - Show changes."""

import sys
import os
from pathlib import Path


def run(args: list[str]) -> int:
    """Show changes."""
    from utils import find_repo_root, is_binary_file
    from index import read_index
    from refs import resolve_ref, get_head_sha
    from objects import read_commit, read_tree, read_blob
    from diff_algo import diff_files, diff_binary

    repo_root = find_repo_root()
    if repo_root is None:
        print("error: not a minigit repository", file=sys.stderr)
        return 1

    # Parse arguments
    cached = False
    staged = False
    stat_only = False
    paths = []
    commits = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--cached':
            cached = True
        elif arg == '--staged':
            staged = True
        elif arg == '--stat':
            stat_only = True
        elif arg == '--':
            paths.extend(args[i + 1:])
            break
        elif not arg.startswith('-'):
            # Could be a commit or a path
            sha = resolve_ref(repo_root, arg)
            if sha:
                commits.append(sha)
            else:
                paths.append(arg)
        i += 1

    # Get index and tree files
    index_entries = {e['path']: e for e in read_index(repo_root)}

    head_sha = get_head_sha(repo_root)
    head_files = {}
    if head_sha:
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

        try:
            commit = read_commit(repo_root, head_sha)
            head_files = get_tree_files(commit['tree'])
        except:
            pass

    # Determine what to diff
    output = []

    if len(commits) == 2:
        # Diff between two commits
        old_sha, new_sha = commits
        old_commit = read_commit(repo_root, old_sha)
        new_commit = read_commit(repo_root, new_sha)

        def get_tree_files_full(tree_sha: str, prefix: str = '') -> dict:
            files = {}
            try:
                tree_entries = read_tree(repo_root, tree_sha)
                for entry in tree_entries:
                    path = f"{prefix}{entry.name}" if prefix else entry.name
                    if entry.mode == '40000':
                        files.update(get_tree_files_full(entry.sha, path + '/'))
                    else:
                        files[path] = entry.sha
            except:
                pass
            return files

        old_files = get_tree_files_full(old_commit['tree'])
        new_files = get_tree_files_full(new_commit['tree'])

        all_paths_set = set(old_files.keys()) | set(new_files.keys())
        if paths:
            all_paths_set = {p for p in all_paths_set if p in paths}

        for path in sorted(all_paths_set):
            old_blob_sha = old_files.get(path)
            new_blob_sha = new_files.get(path)

            if old_blob_sha == new_blob_sha:
                continue

            old_content = None
            new_content = None

            if old_blob_sha:
                try:
                    data = read_blob(repo_root, old_blob_sha)
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    old_content = data.decode()
                except:
                    pass

            if new_blob_sha:
                try:
                    data = read_blob(repo_root, new_blob_sha)
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    new_content = data.decode()
                except:
                    pass

            diff_output = diff_files(old_content, new_content, path)
            if diff_output:
                output.append(diff_output)

    elif len(commits) == 1:
        # Diff working tree against commit
        commit_sha = commits[0]
        commit = read_commit(repo_root, commit_sha)

        def get_tree_files_full(tree_sha: str, prefix: str = '') -> dict:
            files = {}
            try:
                tree_entries = read_tree(repo_root, tree_sha)
                for entry in tree_entries:
                    path = f"{prefix}{entry.name}" if prefix else entry.name
                    if entry.mode == '40000':
                        files.update(get_tree_files_full(entry.sha, path + '/'))
                    else:
                        files[path] = entry.sha
            except:
                pass
            return files

        commit_files = get_tree_files_full(commit['tree'])

        # Get working tree files
        working_files = set()
        for root, dirs, files in os.walk(repo_root):
            if '.minigit' in dirs:
                dirs.remove('.minigit')
            for file in files:
                abs_path = Path(root) / file
                rel_path = str(abs_path.relative_to(repo_root))
                working_files.add(rel_path)

        all_paths_set = set(commit_files.keys()) | working_files
        if paths:
            all_paths_set = {p for p in all_paths_set if p in paths}

        for path in sorted(all_paths_set):
            old_sha = commit_files.get(path)
            full_path = repo_root / path

            old_content = None
            new_content = None

            if old_sha:
                try:
                    data = read_blob(repo_root, old_sha)
                    if is_binary_file(data):
                        if full_path.exists():
                            output.append(f"Binary file {path} differs")
                        continue
                    old_content = data.decode()
                except:
                    pass

            if full_path.exists():
                try:
                    data = full_path.read_bytes()
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    new_content = data.decode()
                except:
                    pass

            if old_content == new_content:
                continue

            diff_output = diff_files(old_content, new_content, path)
            if diff_output:
                output.append(diff_output)

    elif cached or staged:
        # Diff index against HEAD
        all_paths_set = set(index_entries.keys()) | set(head_files.keys())
        if paths:
            all_paths_set = {p for p in all_paths_set if p in paths}

        for path in sorted(all_paths_set):
            index_sha = index_entries.get(path, {}).get('sha')
            head_sha_val = head_files.get(path)

            if index_sha == head_sha_val:
                continue

            old_content = None
            new_content = None

            if head_sha_val:
                try:
                    data = read_blob(repo_root, head_sha_val)
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    old_content = data.decode()
                except:
                    pass

            if index_sha:
                try:
                    data = read_blob(repo_root, index_sha)
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    new_content = data.decode()
                except:
                    pass

            diff_output = diff_files(old_content, new_content, path)
            if diff_output:
                output.append(diff_output)

    else:
        # Diff working tree against index
        all_paths_set = set(index_entries.keys())

        # Get working tree files
        for root, dirs, files in os.walk(repo_root):
            if '.minigit' in dirs:
                dirs.remove('.minigit')
            for file in files:
                abs_path = Path(root) / file
                rel_path = str(abs_path.relative_to(repo_root))
                all_paths_set.add(rel_path)

        if paths:
            all_paths_set = {p for p in all_paths_set if p in paths}

        for path in sorted(all_paths_set):
            index_entry = index_entries.get(path)
            full_path = repo_root / path

            if index_entry is None:
                continue  # Untracked file

            index_sha = index_entry['sha']

            old_content = None
            new_content = None

            try:
                data = read_blob(repo_root, index_sha)
                if is_binary_file(data):
                    if full_path.exists():
                        new_data = full_path.read_bytes()
                        if data != new_data:
                            output.append(f"Binary file {path} differs")
                    continue
                old_content = data.decode()
            except:
                pass

            if full_path.exists():
                try:
                    data = full_path.read_bytes()
                    if is_binary_file(data):
                        output.append(f"Binary file {path} differs")
                        continue
                    new_content = data.decode()
                except:
                    pass
            else:
                new_content = None

            if old_content == new_content:
                continue

            diff_output = diff_files(old_content, new_content, path)
            if diff_output:
                output.append(diff_output)

    # Print output
    if stat_only:
        # Show stat format with insertions/deletions
        for diff_text in output:
            lines = diff_text.split('\n')
            path = None
            insertions = 0
            deletions = 0
            for line in lines:
                if line.startswith('diff --git'):
                    parts = line.split()
                    if len(parts) >= 4:
                        path = parts[2].lstrip('a/')
                elif line.startswith('+') and not line.startswith('+++'):
                    insertions += 1
                elif line.startswith('-') and not line.startswith('---'):
                    deletions += 1
            if path:
                changes = '+' * min(insertions, 30) + '-' * min(deletions, 30)
                total = insertions + deletions
                print(f" {path} | {total} {changes}")
    else:
        for diff_text in output:
            print(diff_text)

    return 0
