"""Three-way merge algorithm with conflict detection for Mini Git."""

from typing import List, Tuple, Optional
from dataclasses import dataclass

from diff_algo import lcs_diff


@dataclass
class MergeResult:
    """Result of a three-way merge."""
    content: str
    has_conflicts: bool
    conflict_markers: List[Tuple[int, int]]  # (start, end) line numbers of conflicts


def three_way_merge(base: str, ours: str, theirs: str,
                    our_label: str = 'HEAD',
                    their_label: str = 'branch') -> MergeResult:
    """
    Perform a three-way merge.

    Args:
        base: Common ancestor content
        ours: Our version (current branch)
        theirs: Their version (branch being merged)
        our_label: Label for our side in conflict markers
        their_label: Label for their side in conflict markers

    Returns:
        MergeResult with merged content and conflict information
    """
    base_lines = base.splitlines(keepends=False)
    our_lines = ours.splitlines(keepends=False)
    their_lines = theirs.splitlines(keepends=False)

    # Get diffs from base to each version
    # Use lcs_diff but extract just op and line
    our_diff = [(op, line) for op, line, _, _ in lcs_diff(base_lines, our_lines)]
    their_diff = [(op, line) for op, line, _, _ in lcs_diff(base_lines, their_lines)]

    # Build change maps: which base lines changed in each version
    our_changes = {}  # base_line_idx -> (is_deleted, new_lines)
    their_changes = {}

    base_idx = 0
    new_lines = []
    for op, line in our_diff:
        if op == ' ':
            if new_lines:
                # Lines were added before this context
                if base_idx > 0:
                    if base_idx - 1 in our_changes:
                        our_changes[base_idx - 1][1].extend(new_lines)
                    else:
                        our_changes[base_idx - 1] = (False, new_lines)
                else:
                    our_changes[-1] = (False, new_lines)
                new_lines = []
            base_idx += 1
        elif op == '-':
            our_changes[base_idx] = (True, [])
            base_idx += 1
        else:  # '+'
            new_lines.append(line)

    if new_lines:
        our_changes[base_idx - 1 if base_idx > 0 else -1] = (False, new_lines)

    base_idx = 0
    new_lines = []
    for op, line in their_diff:
        if op == ' ':
            if new_lines:
                if base_idx > 0:
                    if base_idx - 1 in their_changes:
                        their_changes[base_idx - 1][1].extend(new_lines)
                    else:
                        their_changes[base_idx - 1] = (False, new_lines)
                else:
                    their_changes[-1] = (False, new_lines)
                new_lines = []
            base_idx += 1
        elif op == '-':
            their_changes[base_idx] = (True, [])
            base_idx += 1
        else:
            new_lines.append(line)

    if new_lines:
        their_changes[base_idx - 1 if base_idx > 0 else -1] = (False, new_lines)

    # Merge the changes
    result_lines = []
    conflicts = []
    has_conflicts = False

    # Handle insertions before first line
    if -1 in our_changes and -1 in their_changes:
        _, our_inserts = our_changes[-1]
        _, their_inserts = their_changes[-1]
        if our_inserts != their_inserts:
            has_conflicts = True
            conflict_start = len(result_lines)
            result_lines.append(f'<<<<<<< {our_label}')
            result_lines.extend(our_inserts)
            result_lines.append('=======')
            result_lines.extend(their_inserts)
            result_lines.append(f'>>>>>>> {their_label}')
            conflicts.append((conflict_start, len(result_lines)))
        else:
            result_lines.extend(our_inserts)
    elif -1 in our_changes:
        result_lines.extend(our_changes[-1][1])
    elif -1 in their_changes:
        result_lines.extend(their_changes[-1][1])

    for i, base_line in enumerate(base_lines):
        our_change = our_changes.get(i)
        their_change = their_changes.get(i)

        if our_change is None and their_change is None:
            # No changes
            result_lines.append(base_line)
        elif our_change is not None and their_change is None:
            # Only our change
            our_deleted, our_inserts = our_change
            if not our_deleted:
                result_lines.append(base_line)
            result_lines.extend(our_inserts)
        elif our_change is None and their_change is not None:
            # Only their change
            their_deleted, their_inserts = their_change
            if not their_deleted:
                result_lines.append(base_line)
            result_lines.extend(their_inserts)
        else:
            # Both changed - check for conflict
            our_deleted, our_inserts = our_change
            their_deleted, their_inserts = their_change

            if our_deleted == their_deleted and our_inserts == their_inserts:
                # Same change - no conflict
                if not our_deleted:
                    result_lines.append(base_line)
                result_lines.extend(our_inserts)
            else:
                # Conflict!
                has_conflicts = True
                conflict_start = len(result_lines)
                result_lines.append(f'<<<<<<< {our_label}')
                if not our_deleted:
                    result_lines.append(base_line)
                result_lines.extend(our_inserts)
                result_lines.append('=======')
                if not their_deleted:
                    result_lines.append(base_line)
                result_lines.extend(their_inserts)
                result_lines.append(f'>>>>>>> {their_label}')
                conflicts.append((conflict_start, len(result_lines)))

    return MergeResult(
        content='\n'.join(result_lines) + ('\n' if result_lines else ''),
        has_conflicts=has_conflicts,
        conflict_markers=conflicts
    )


def merge_files(base_content: Optional[str], our_content: Optional[str],
                their_content: Optional[str],
                our_label: str = 'HEAD',
                their_label: str = 'branch') -> Tuple[str, bool]:
    """
    Merge file contents handling creation/deletion cases.

    Returns:
        (merged_content, has_conflict)
    """
    # Handle cases where file doesn't exist in one or more versions
    if base_content is None:
        # File added in one or both branches
        if our_content is None:
            return their_content or '', False
        if their_content is None:
            return our_content, False
        if our_content == their_content:
            return our_content, False
        # Both added differently - conflict
        return (
            f'<<<<<<< {our_label}\n{our_content}=======\n{their_content}>>>>>>> {their_label}\n',
            True
        )

    if our_content is None:
        # Deleted in ours
        if their_content is None or their_content == base_content:
            return '', False  # Deleted in both or unchanged in theirs
        # Modified in theirs, deleted in ours - conflict
        return (
            f'<<<<<<< {our_label}\n=======\n{their_content}>>>>>>> {their_label}\n',
            True
        )

    if their_content is None:
        # Deleted in theirs
        if our_content == base_content:
            return '', False  # Unchanged in ours
        # Modified in ours, deleted in theirs - conflict
        return (
            f'<<<<<<< {our_label}\n{our_content}=======\n>>>>>>> {their_label}\n',
            True
        )

    # Both versions exist - do three-way merge
    if our_content == their_content:
        return our_content, False

    if our_content == base_content:
        return their_content, False

    if their_content == base_content:
        return our_content, False

    # Both modified differently - need three-way merge
    result = three_way_merge(base_content, our_content, their_content,
                             our_label, their_label)
    return result.content, result.has_conflicts


def find_merge_base(sha1: str, sha2: str, repo_root=None) -> Optional[str]:
    """
    Find the merge base (common ancestor) of two commits.
    Uses a simple BFS approach.
    """
    from objects import read_object, Commit

    # Get all ancestors of sha1
    ancestors1 = set()
    to_visit = [sha1]
    while to_visit:
        sha = to_visit.pop(0)
        if sha in ancestors1:
            continue
        ancestors1.add(sha)
        try:
            obj_type, data = read_object(sha, repo_root)
            if obj_type == 'commit':
                commit = Commit.deserialize(data)
                to_visit.extend(commit.parents)
        except:
            pass

    # Find first ancestor of sha2 that's also an ancestor of sha1
    to_visit = [sha2]
    visited = set()
    while to_visit:
        sha = to_visit.pop(0)
        if sha in visited:
            continue
        visited.add(sha)

        if sha in ancestors1:
            return sha

        try:
            obj_type, data = read_object(sha, repo_root)
            if obj_type == 'commit':
                commit = Commit.deserialize(data)
                to_visit.extend(commit.parents)
        except:
            pass

    return None
