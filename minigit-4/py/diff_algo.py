"""Diff algorithm implementation for Mini Git."""

from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class DiffHunk:
    """A single hunk of a diff."""
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[str]  # Each line prefixed with ' ', '+', or '-'


def lcs_diff(old: List[str], new: List[str]) -> List[Tuple[str, str, int, int]]:
    """
    Compute diff using LCS (Longest Common Subsequence).
    Returns list of (op, line, old_idx, new_idx).
    """
    m, n = len(old), len(new)

    # Build LCS table
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if old[i - 1] == new[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to get the diff
    result = []
    i, j = m, n

    while i > 0 or j > 0:
        if i > 0 and j > 0 and old[i - 1] == new[j - 1]:
            result.append((' ', old[i - 1], i - 1, j - 1))
            i -= 1
            j -= 1
        elif j > 0 and (i == 0 or dp[i][j - 1] >= dp[i - 1][j]):
            result.append(('+', new[j - 1], -1, j - 1))
            j -= 1
        else:
            result.append(('-', old[i - 1], i - 1, -1))
            i -= 1

    result.reverse()
    return result


def compute_diff(old_lines: List[str], new_lines: List[str],
                 context: int = 3) -> List[DiffHunk]:
    """Compute unified diff hunks between old and new lines."""
    if old_lines == new_lines:
        return []

    edits = lcs_diff(old_lines, new_lines)

    if not edits or all(op == ' ' for op, _, _, _ in edits):
        return []

    # Group edits into hunks
    hunks = []
    hunk_start = None

    for i, (op, line, old_idx, new_idx) in enumerate(edits):
        if op != ' ':
            if hunk_start is None:
                hunk_start = i
        else:
            if hunk_start is not None:
                # Check if we're past context after the change
                # Find the last change before this
                last_change_idx = i - 1
                while last_change_idx >= hunk_start and edits[last_change_idx][0] == ' ':
                    last_change_idx -= 1

                context_since_change = i - last_change_idx - 1

                if context_since_change >= context:
                    # End this hunk
                    hunk_end = min(i, last_change_idx + context + 1)
                    hunk_begin = max(0, hunk_start - context)

                    # Find where next change starts
                    next_change = i
                    while next_change < len(edits) and edits[next_change][0] == ' ':
                        next_change += 1

                    if next_change >= len(edits):
                        # No more changes - finalize hunk
                        hunks.append(create_hunk(edits, hunk_begin, hunk_end, old_lines, new_lines))
                        hunk_start = None
                    elif next_change - last_change_idx - 1 > 2 * context:
                        # Gap is big enough to separate hunks
                        hunks.append(create_hunk(edits, hunk_begin, hunk_end, old_lines, new_lines))
                        hunk_start = None

    # Handle remaining hunk
    if hunk_start is not None:
        hunk_begin = max(0, hunk_start - context)
        hunk_end = len(edits)
        hunks.append(create_hunk(edits, hunk_begin, hunk_end, old_lines, new_lines))

    return hunks


def create_hunk(edits: List[Tuple[str, str, int, int]],
                start: int, end: int,
                old_lines: List[str], new_lines: List[str]) -> DiffHunk:
    """Create a hunk from a slice of edits."""
    # Trim trailing context
    while end > start and edits[end - 1][0] == ' ':
        end -= 1
    # Add back context
    end = min(len(edits), end + 3)

    lines = []
    old_count = 0
    new_count = 0

    # Get starting positions
    first_old = -1
    first_new = -1

    for i in range(start, end):
        op, line, old_idx, new_idx = edits[i]
        if op == ' ':
            if first_old < 0:
                first_old = old_idx
            if first_new < 0:
                first_new = new_idx
            lines.append(' ' + line)
            old_count += 1
            new_count += 1
        elif op == '-':
            if first_old < 0:
                first_old = old_idx
            lines.append('-' + line)
            old_count += 1
        else:  # '+'
            if first_new < 0:
                first_new = new_idx
            lines.append('+' + line)
            new_count += 1

    return DiffHunk(
        old_start=max(0, first_old) if first_old >= 0 else 0,
        old_count=old_count,
        new_start=max(0, first_new) if first_new >= 0 else 0,
        new_count=new_count,
        lines=lines
    )


def format_unified_diff(old_name: str, new_name: str,
                        old_lines: List[str], new_lines: List[str],
                        context: int = 3) -> str:
    """Format a unified diff output."""
    # Handle empty cases
    if not old_lines and not new_lines:
        return ''

    if not old_lines:
        # All new
        lines = [f'--- {old_name}', f'+++ {new_name}']
        lines.append(f'@@ -0,0 +1,{len(new_lines)} @@')
        for line in new_lines:
            lines.append('+' + line)
        return '\n'.join(lines)

    if not new_lines:
        # All deleted
        lines = [f'--- {old_name}', f'+++ {new_name}']
        lines.append(f'@@ -1,{len(old_lines)} +0,0 @@')
        for line in old_lines:
            lines.append('-' + line)
        return '\n'.join(lines)

    hunks = compute_diff(old_lines, new_lines, context)

    if not hunks:
        return ''

    lines = [f'--- {old_name}', f'+++ {new_name}']

    for hunk in hunks:
        if hunk.old_count == 0:
            old_range = f'{hunk.old_start},{hunk.old_count}'
        elif hunk.old_count == 1:
            old_range = str(hunk.old_start + 1)
        else:
            old_range = f'{hunk.old_start + 1},{hunk.old_count}'

        if hunk.new_count == 0:
            new_range = f'{hunk.new_start},{hunk.new_count}'
        elif hunk.new_count == 1:
            new_range = str(hunk.new_start + 1)
        else:
            new_range = f'{hunk.new_start + 1},{hunk.new_count}'

        lines.append(f'@@ -{old_range} +{new_range} @@')
        lines.extend(hunk.lines)

    return '\n'.join(lines)


def simple_diff(old_content: str, new_content: str,
                old_name: str = 'a', new_name: str = 'b',
                context: int = 3) -> str:
    """Convenience function to diff two strings."""
    old_lines = old_content.splitlines(keepends=False)
    new_lines = new_content.splitlines(keepends=False)
    return format_unified_diff(old_name, new_name, old_lines, new_lines, context)
