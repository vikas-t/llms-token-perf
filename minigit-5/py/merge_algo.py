"""Three-way merge algorithm with conflict detection."""

from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class MergeResult:
    """Result of a three-way merge."""
    content: str
    has_conflicts: bool
    conflict_markers: List[Tuple[int, int]]  # Line ranges with conflicts


def find_lcs(a: List[str], b: List[str]) -> List[Tuple[int, int]]:
    """Find longest common subsequence indices."""
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return []

    # Build LCS table
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to get LCS
    result = []
    i, j = n, m
    while i > 0 and j > 0:
        if a[i - 1] == b[j - 1]:
            result.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif dp[i - 1][j] > dp[i][j - 1]:
            i -= 1
        else:
            j -= 1

    return list(reversed(result))


def three_way_merge(
    base: List[str],
    ours: List[str],
    theirs: List[str],
    ours_label: str = "HEAD",
    theirs_label: str = "branch"
) -> MergeResult:
    """
    Perform a three-way merge.

    Args:
        base: Common ancestor content
        ours: Our version content
        theirs: Their version content
        ours_label: Label for our changes in conflict markers
        theirs_label: Label for their changes in conflict markers

    Returns:
        MergeResult with merged content and conflict info
    """
    # If either side is unchanged from base, take the other
    if ours == base:
        return MergeResult('\n'.join(theirs) + '\n' if theirs else '', False, [])
    if theirs == base:
        return MergeResult('\n'.join(ours) + '\n' if ours else '', False, [])
    if ours == theirs:
        return MergeResult('\n'.join(ours) + '\n' if ours else '', False, [])

    # Get the diff hunks
    result_lines = []
    has_conflicts = False
    conflict_markers = []

    # Simple diff3-style merge
    lcs_base_ours = find_lcs(base, ours)
    lcs_base_theirs = find_lcs(base, theirs)

    # Build mapping of base lines to ours/theirs
    base_to_ours = {b: o for b, o in lcs_base_ours}
    base_to_theirs = {b: t for b, t in lcs_base_theirs}

    # Track positions
    ours_pos = 0
    theirs_pos = 0
    base_pos = 0

    while base_pos < len(base) or ours_pos < len(ours) or theirs_pos < len(theirs):
        # Check if current base line is in LCS with both
        base_in_ours = base_pos in base_to_ours
        base_in_theirs = base_pos in base_to_theirs

        if base_pos < len(base) and base_in_ours and base_in_theirs:
            # Line unchanged in both - keep it
            ours_target = base_to_ours[base_pos]
            theirs_target = base_to_theirs[base_pos]

            # Add any lines added in ours before this match
            while ours_pos < ours_target:
                result_lines.append(ours[ours_pos])
                ours_pos += 1

            # Add any lines added in theirs before this match
            while theirs_pos < theirs_target:
                result_lines.append(theirs[theirs_pos])
                theirs_pos += 1

            # Add the common line
            result_lines.append(base[base_pos])
            base_pos += 1
            ours_pos += 1
            theirs_pos += 1

        elif base_pos < len(base):
            # Base line not in both - handle divergence
            # Collect changes from ours and theirs until we find another sync point

            ours_changes = []
            theirs_changes = []

            # Find next sync point in base
            next_sync = None
            for b in range(base_pos, len(base)):
                if b in base_to_ours and b in base_to_theirs:
                    next_sync = b
                    break

            if next_sync is None:
                next_sync = len(base)

            # Collect what ours has from ours_pos to the sync point
            if base_pos in base_to_ours:
                ours_end = base_to_ours.get(next_sync - 1, len(ours) - 1) + 1 if next_sync > base_pos else base_to_ours[base_pos]
            else:
                ours_end = base_to_ours.get(next_sync, len(ours)) if next_sync in base_to_ours else len(ours)

            if base_pos in base_to_theirs:
                theirs_end = base_to_theirs.get(next_sync - 1, len(theirs) - 1) + 1 if next_sync > base_pos else base_to_theirs[base_pos]
            else:
                theirs_end = base_to_theirs.get(next_sync, len(theirs)) if next_sync in base_to_theirs else len(theirs)

            ours_changes = ours[ours_pos:ours_end]
            theirs_changes = theirs[theirs_pos:theirs_end]

            if ours_changes == theirs_changes:
                # Same changes - no conflict
                result_lines.extend(ours_changes)
            elif not ours_changes:
                # Only theirs changed
                result_lines.extend(theirs_changes)
            elif not theirs_changes:
                # Only ours changed
                result_lines.extend(ours_changes)
            else:
                # Conflict!
                has_conflicts = True
                conflict_start = len(result_lines)
                result_lines.append(f"<<<<<<< {ours_label}")
                result_lines.extend(ours_changes)
                result_lines.append("=======")
                result_lines.extend(theirs_changes)
                result_lines.append(f">>>>>>> {theirs_label}")
                conflict_markers.append((conflict_start, len(result_lines)))

            base_pos = next_sync
            ours_pos = ours_end
            theirs_pos = theirs_end

        else:
            # Past end of base - add remaining from both
            ours_rest = ours[ours_pos:]
            theirs_rest = theirs[theirs_pos:]

            if ours_rest == theirs_rest:
                result_lines.extend(ours_rest)
            elif not ours_rest:
                result_lines.extend(theirs_rest)
            elif not theirs_rest:
                result_lines.extend(ours_rest)
            else:
                # Conflict at end
                has_conflicts = True
                conflict_start = len(result_lines)
                result_lines.append(f"<<<<<<< {ours_label}")
                result_lines.extend(ours_rest)
                result_lines.append("=======")
                result_lines.extend(theirs_rest)
                result_lines.append(f">>>>>>> {theirs_label}")
                conflict_markers.append((conflict_start, len(result_lines)))

            break

    content = '\n'.join(result_lines)
    if result_lines and not content.endswith('\n'):
        content += '\n'

    return MergeResult(content, has_conflicts, conflict_markers)


def find_merge_base(repo_root, commit1: str, commit2: str) -> Optional[str]:
    """Find the common ancestor of two commits."""
    from objects import Commit

    # Get all ancestors of commit1
    ancestors1 = set()
    queue = [commit1]
    while queue:
        sha = queue.pop(0)
        if sha in ancestors1:
            continue
        ancestors1.add(sha)
        try:
            commit = Commit.read(sha, repo_root)
            queue.extend(commit.parents)
        except:
            pass

    # Find first ancestor of commit2 that's in ancestors1
    queue = [commit2]
    visited = set()
    while queue:
        sha = queue.pop(0)
        if sha in visited:
            continue
        visited.add(sha)
        if sha in ancestors1:
            return sha
        try:
            commit = Commit.read(sha, repo_root)
            queue.extend(commit.parents)
        except:
            pass

    return None
