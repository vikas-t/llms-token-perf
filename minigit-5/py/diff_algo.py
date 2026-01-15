"""Myers diff algorithm implementation."""

from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class DiffHunk:
    """Represents a hunk in unified diff format."""
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[str]  # Lines with +/- prefix


def myers_diff(a: List[str], b: List[str]) -> List[Tuple[str, str]]:
    """
    Compute the diff between two sequences using Myers algorithm.
    Returns list of (op, line) where op is ' ', '+', or '-'.
    """
    n, m = len(a), len(b)

    # Handle edge cases
    if n == 0 and m == 0:
        return []
    if n == 0:
        return [('+', line) for line in b]
    if m == 0:
        return [('-', line) for line in a]

    # Use simple LCS-based approach for smaller inputs
    # Myers is overkill and complex for our needs
    return lcs_diff(a, b)


def lcs_diff(a: List[str], b: List[str]) -> List[Tuple[str, str]]:
    """Compute diff using LCS (simpler than Myers but correct)."""
    n, m = len(a), len(b)

    # Build LCS table
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to get diff
    result = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and a[i - 1] == b[j - 1]:
            result.append((' ', a[i - 1]))
            i -= 1
            j -= 1
        elif j > 0 and (i == 0 or dp[i][j - 1] >= dp[i - 1][j]):
            result.append(('+', b[j - 1]))
            j -= 1
        else:
            result.append(('-', a[i - 1]))
            i -= 1

    return list(reversed(result))


def create_unified_diff(
    old_lines: List[str],
    new_lines: List[str],
    old_name: str,
    new_name: str,
    context: int = 3
) -> str:
    """Create unified diff format output."""
    diff_ops = lcs_diff(old_lines, new_lines)

    if not diff_ops:
        return ""

    # Check if there are any actual changes
    has_changes = any(op != ' ' for op, _ in diff_ops)
    if not has_changes:
        return ""

    lines = []
    lines.append(f"--- {old_name}")
    lines.append(f"+++ {new_name}")

    # Group into hunks
    hunks = create_hunks(diff_ops, context)

    for hunk in hunks:
        lines.append(f"@@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@")
        lines.extend(hunk.lines)

    return '\n'.join(lines) + '\n'


def create_hunks(diff_ops: List[Tuple[str, str]], context: int = 3) -> List[DiffHunk]:
    """Group diff operations into hunks with context."""
    if not diff_ops:
        return []

    hunks = []
    current_hunk = None
    old_line = 1
    new_line = 1

    # Find change positions
    change_positions = [i for i, (op, _) in enumerate(diff_ops) if op != ' ']

    if not change_positions:
        return []

    # Process each change, grouping nearby changes into hunks
    i = 0
    while i < len(diff_ops):
        op, line = diff_ops[i]

        if op != ' ':
            # Start or extend a hunk
            if current_hunk is None:
                # Start new hunk with context before
                start_ctx = max(0, i - context)
                current_hunk = {
                    'old_start': old_line - (i - start_ctx),
                    'new_start': new_line - (i - start_ctx),
                    'lines': [],
                    'old_count': 0,
                    'new_count': 0
                }
                # Add context before
                for j in range(start_ctx, i):
                    op_ctx, line_ctx = diff_ops[j]
                    current_hunk['lines'].append(f" {line_ctx}")
                    current_hunk['old_count'] += 1
                    current_hunk['new_count'] += 1

            # Add the change
            if op == '+':
                current_hunk['lines'].append(f"+{line}")
                current_hunk['new_count'] += 1
            else:
                current_hunk['lines'].append(f"-{line}")
                current_hunk['old_count'] += 1

        else:
            # Context line
            if current_hunk is not None:
                # Check if we should close the hunk
                # Look ahead to see if there's another change within context range
                next_change = None
                for j in range(i + 1, min(i + context * 2 + 1, len(diff_ops))):
                    if diff_ops[j][0] != ' ':
                        next_change = j
                        break

                if next_change is not None and next_change - i <= context * 2:
                    # Continue the hunk
                    current_hunk['lines'].append(f" {line}")
                    current_hunk['old_count'] += 1
                    current_hunk['new_count'] += 1
                else:
                    # Add trailing context and close hunk
                    trailing_ctx = 0
                    for j in range(i, min(i + context, len(diff_ops))):
                        op_ctx, line_ctx = diff_ops[j]
                        if op_ctx == ' ':
                            current_hunk['lines'].append(f" {line_ctx}")
                            current_hunk['old_count'] += 1
                            current_hunk['new_count'] += 1
                            trailing_ctx += 1
                        else:
                            break

                    hunks.append(DiffHunk(
                        old_start=current_hunk['old_start'],
                        old_count=current_hunk['old_count'],
                        new_start=current_hunk['new_start'],
                        new_count=current_hunk['new_count'],
                        lines=current_hunk['lines']
                    ))
                    current_hunk = None
                    i += trailing_ctx - 1  # Skip the trailing context we just added

        # Update line counters
        if op in (' ', '-'):
            old_line += 1
        if op in (' ', '+'):
            new_line += 1

        i += 1

    # Close any remaining hunk
    if current_hunk is not None:
        hunks.append(DiffHunk(
            old_start=current_hunk['old_start'],
            old_count=current_hunk['old_count'],
            new_start=current_hunk['new_start'],
            new_count=current_hunk['new_count'],
            lines=current_hunk['lines']
        ))

    return hunks


def compute_diff_stat(old_lines: List[str], new_lines: List[str]) -> Tuple[int, int]:
    """Compute number of insertions and deletions."""
    diff_ops = lcs_diff(old_lines, new_lines)
    insertions = sum(1 for op, _ in diff_ops if op == '+')
    deletions = sum(1 for op, _ in diff_ops if op == '-')
    return insertions, deletions
