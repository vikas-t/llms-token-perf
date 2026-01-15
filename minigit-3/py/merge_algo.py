"""Three-way merge with conflict detection for minigit."""

from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class MergeResult:
    """Result of a merge operation."""
    content: str
    has_conflict: bool
    conflict_markers: bool = False


def find_common_ancestor(repo_root, sha1: str, sha2: str) -> Optional[str]:
    """Find the common ancestor of two commits."""
    from objects import read_commit

    # Build ancestry sets
    ancestors1 = set()
    ancestors2 = set()

    def get_ancestors(sha: str, ancestors: set, depth: int = 0):
        if sha in ancestors or depth > 1000:
            return
        ancestors.add(sha)
        try:
            commit = read_commit(repo_root, sha)
            for parent in commit['parents']:
                get_ancestors(parent, ancestors, depth + 1)
        except:
            pass

    get_ancestors(sha1, ancestors1)
    get_ancestors(sha2, ancestors2)

    # Find common ancestors
    common = ancestors1 & ancestors2

    if not common:
        return None

    # Return the most recent common ancestor
    # (simplified - just return any common ancestor)
    # For proper implementation, would need to find the "best" one
    return next(iter(common))


def three_way_merge(base: List[str], ours: List[str], theirs: List[str],
                    ours_label: str = "HEAD", theirs_label: str = "branch") -> MergeResult:
    """
    Perform a three-way merge.
    Returns merged content and conflict status.
    """
    from diff_algo import myers_diff

    # Compute diffs from base
    diff_ours = myers_diff(base, ours)
    diff_theirs = myers_diff(base, theirs)

    # Build change maps
    # Map base line index to changes
    changes_ours = {}  # base_idx -> (op, new_lines)
    changes_theirs = {}

    def build_change_map(diff_ops, change_map):
        base_idx = 0
        new_lines = []
        in_change = False
        change_start = 0

        for op, line in diff_ops:
            if op == ' ':
                if in_change:
                    change_map[change_start] = ('modify', new_lines[:])
                    new_lines = []
                    in_change = False
                base_idx += 1
            elif op == '-':
                if not in_change:
                    in_change = True
                    change_start = base_idx
                base_idx += 1
            elif op == '+':
                if not in_change:
                    in_change = True
                    change_start = base_idx
                new_lines.append(line)

        if in_change:
            change_map[change_start] = ('modify', new_lines[:])

    build_change_map(diff_ours, changes_ours)
    build_change_map(diff_theirs, changes_theirs)

    # Simple merge: if both made same change, use it
    # If only one made a change, use that
    # If both made different changes to same region, conflict

    result_lines = []
    has_conflict = False
    base_idx = 0
    ours_idx = 0
    theirs_idx = 0

    while base_idx < len(base) or ours_idx < len(ours) or theirs_idx < len(theirs):
        ours_change = changes_ours.get(base_idx)
        theirs_change = changes_theirs.get(base_idx)

        if ours_change is None and theirs_change is None:
            # No changes at this position
            if base_idx < len(base):
                result_lines.append(base[base_idx])
                base_idx += 1
            else:
                break
        elif ours_change is not None and theirs_change is None:
            # Only ours changed
            _, new_lines = ours_change
            result_lines.extend(new_lines)
            base_idx += 1
        elif ours_change is None and theirs_change is not None:
            # Only theirs changed
            _, new_lines = theirs_change
            result_lines.extend(new_lines)
            base_idx += 1
        else:
            # Both changed - check if same
            _, ours_lines = ours_change
            _, theirs_lines = theirs_change

            if ours_lines == theirs_lines:
                # Same change
                result_lines.extend(ours_lines)
            else:
                # Conflict!
                has_conflict = True
                result_lines.append(f"<<<<<<< {ours_label}")
                result_lines.extend(ours_lines)
                result_lines.append("=======")
                result_lines.extend(theirs_lines)
                result_lines.append(f">>>>>>> {theirs_label}")
            base_idx += 1

    content = '\n'.join(result_lines)
    if result_lines:
        content += '\n'

    return MergeResult(content=content, has_conflict=has_conflict, conflict_markers=has_conflict)


def merge_file(base_content: Optional[str], ours_content: str, theirs_content: str,
               ours_label: str = "HEAD", theirs_label: str = "branch") -> MergeResult:
    """
    Merge a single file with three-way merge.
    """
    if base_content is None:
        # No common base - both added the file
        if ours_content == theirs_content:
            return MergeResult(content=ours_content, has_conflict=False)
        else:
            # Conflict - both added different content
            lines = []
            lines.append(f"<<<<<<< {ours_label}")
            lines.append(ours_content.rstrip('\n'))
            lines.append("=======")
            lines.append(theirs_content.rstrip('\n'))
            lines.append(f">>>>>>> {theirs_label}")
            return MergeResult(
                content='\n'.join(lines) + '\n',
                has_conflict=True,
                conflict_markers=True
            )

    base_lines = base_content.splitlines() if base_content else []
    ours_lines = ours_content.splitlines() if ours_content else []
    theirs_lines = theirs_content.splitlines() if theirs_content else []

    return three_way_merge(base_lines, ours_lines, theirs_lines, ours_label, theirs_label)


def merge_trees(repo_root, base_sha: Optional[str], ours_sha: str, theirs_sha: str,
                ours_label: str = "HEAD", theirs_label: str = "branch") -> Tuple[dict, bool]:
    """
    Merge two trees. Returns (merged_entries, has_conflicts).
    merged_entries is dict of path -> (sha, mode, content if conflict)
    """
    from objects import read_tree, read_blob, TreeEntry

    def get_tree_entries(sha: Optional[str], prefix: str = '') -> dict:
        if sha is None:
            return {}

        entries = {}
        try:
            tree = read_tree(repo_root, sha)
            for entry in tree:
                path = f"{prefix}{entry.name}" if prefix else entry.name
                if entry.mode == '40000':
                    # Recurse into subtree
                    entries.update(get_tree_entries(entry.sha, path + '/'))
                else:
                    entries[path] = entry
        except:
            pass
        return entries

    base_entries = get_tree_entries(base_sha)
    ours_entries = get_tree_entries(ours_sha)
    theirs_entries = get_tree_entries(theirs_sha)

    all_paths = set(base_entries.keys()) | set(ours_entries.keys()) | set(theirs_entries.keys())

    merged = {}
    has_conflicts = False

    for path in all_paths:
        base_entry = base_entries.get(path)
        ours_entry = ours_entries.get(path)
        theirs_entry = theirs_entries.get(path)

        base_sha_val = base_entry.sha if base_entry else None
        ours_sha_val = ours_entry.sha if ours_entry else None
        theirs_sha_val = theirs_entry.sha if theirs_entry else None

        # Determine mode (prefer ours)
        mode = ours_entry.mode if ours_entry else (theirs_entry.mode if theirs_entry else '100644')

        if ours_sha_val == theirs_sha_val:
            # Both have same content (or both deleted)
            if ours_sha_val:
                merged[path] = {'sha': ours_sha_val, 'mode': mode}
        elif ours_sha_val == base_sha_val:
            # Only theirs changed
            if theirs_sha_val:
                merged[path] = {'sha': theirs_sha_val, 'mode': mode}
            # else: theirs deleted, use that
        elif theirs_sha_val == base_sha_val:
            # Only ours changed
            if ours_sha_val:
                merged[path] = {'sha': ours_sha_val, 'mode': mode}
            # else: ours deleted, use that
        else:
            # Both changed differently - need to merge content
            try:
                base_content = read_blob(repo_root, base_sha_val).decode() if base_sha_val else None
                ours_content = read_blob(repo_root, ours_sha_val).decode() if ours_sha_val else ''
                theirs_content = read_blob(repo_root, theirs_sha_val).decode() if theirs_sha_val else ''

                result = merge_file(base_content, ours_content, theirs_content, ours_label, theirs_label)

                if result.has_conflict:
                    has_conflicts = True
                    merged[path] = {'mode': mode, 'conflict': True, 'content': result.content}
                else:
                    # Create blob for merged content
                    from objects import create_blob
                    new_sha = create_blob(repo_root, result.content.encode())
                    merged[path] = {'sha': new_sha, 'mode': mode}
            except:
                # Binary or error - mark as conflict
                has_conflicts = True
                merged[path] = {'mode': mode, 'conflict': True, 'ours_sha': ours_sha_val, 'theirs_sha': theirs_sha_val}

    return merged, has_conflicts
