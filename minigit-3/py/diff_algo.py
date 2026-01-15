"""Myers diff algorithm for minigit."""

from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class DiffHunk:
    """A hunk in a diff."""
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[str]


def myers_diff(a: List[str], b: List[str]) -> List[Tuple[str, str]]:
    """
    Compute the diff between two lists of strings using Myers algorithm.
    Returns list of (op, line) where op is '+', '-', or ' '.
    """
    n = len(a)
    m = len(b)

    # Max edit distance
    max_d = n + m

    # V array for storing endpoints of furthest reaching paths
    v = {1: 0}

    # Trace for backtracking
    trace = []

    # Find the shortest edit script
    for d in range(max_d + 1):
        trace.append(dict(v))
        for k in range(-d, d + 1, 2):
            if k == -d or (k != d and v.get(k - 1, -1) < v.get(k + 1, -1)):
                x = v.get(k + 1, 0)
            else:
                x = v.get(k - 1, 0) + 1

            y = x - k

            # Extend diagonal
            while x < n and y < m and a[x] == b[y]:
                x += 1
                y += 1

            v[k] = x

            if x >= n and y >= m:
                # Found the end
                return backtrack(trace, a, b, d)

    return backtrack(trace, a, b, max_d)


def backtrack(trace: List[dict], a: List[str], b: List[str], d: int) -> List[Tuple[str, str]]:
    """Backtrack through trace to build the diff."""
    x = len(a)
    y = len(b)

    ops = []

    for d_idx in range(d, -1, -1):
        v = trace[d_idx]
        k = x - y

        if k == -d_idx or (k != d_idx and v.get(k - 1, -1) < v.get(k + 1, -1)):
            prev_k = k + 1
        else:
            prev_k = k - 1

        prev_x = v.get(prev_k, 0)
        prev_y = prev_x - prev_k

        # Add diagonal moves
        while x > prev_x and y > prev_y:
            x -= 1
            y -= 1
            ops.append((' ', a[x]))

        if d_idx > 0:
            if x == prev_x:
                # Insertion
                y -= 1
                ops.append(('+', b[y]))
            else:
                # Deletion
                x -= 1
                ops.append(('-', a[x]))

    ops.reverse()
    return ops


def compute_hunks(diff_ops: List[Tuple[str, str]], context: int = 3) -> List[DiffHunk]:
    """Group diff operations into hunks with context lines."""
    if not diff_ops:
        return []

    hunks = []
    current_hunk = None
    old_line = 0
    new_line = 0
    pending_context = []

    for op, line in diff_ops:
        if op == ' ':
            old_line += 1
            new_line += 1
            if current_hunk is not None:
                current_hunk.lines.append(f" {line}")
                current_hunk.old_count += 1
                current_hunk.new_count += 1
                # Check if we've had enough trailing context
                trailing_context = 0
                for l in reversed(current_hunk.lines):
                    if l.startswith(' '):
                        trailing_context += 1
                    else:
                        break
                if trailing_context >= context:
                    hunks.append(current_hunk)
                    current_hunk = None
                    pending_context = []
            else:
                pending_context.append((op, line, old_line, new_line))
                if len(pending_context) > context:
                    pending_context.pop(0)

        elif op == '-':
            if current_hunk is None:
                # Start new hunk with pending context
                old_start = old_line + 1 - len(pending_context)
                new_start = new_line + 1 - len(pending_context)
                current_hunk = DiffHunk(
                    old_start=old_start,
                    old_count=0,
                    new_start=new_start,
                    new_count=0,
                    lines=[]
                )
                for ctx_op, ctx_line, _, _ in pending_context:
                    current_hunk.lines.append(f" {ctx_line}")
                    current_hunk.old_count += 1
                    current_hunk.new_count += 1
                pending_context = []

            current_hunk.lines.append(f"-{line}")
            current_hunk.old_count += 1
            old_line += 1

        elif op == '+':
            if current_hunk is None:
                old_start = old_line + 1 - len(pending_context)
                new_start = new_line + 1 - len(pending_context)
                current_hunk = DiffHunk(
                    old_start=old_start,
                    old_count=0,
                    new_start=new_start,
                    new_count=0,
                    lines=[]
                )
                for ctx_op, ctx_line, _, _ in pending_context:
                    current_hunk.lines.append(f" {ctx_line}")
                    current_hunk.old_count += 1
                    current_hunk.new_count += 1
                pending_context = []

            current_hunk.lines.append(f"+{line}")
            current_hunk.new_count += 1
            new_line += 1

    if current_hunk is not None:
        # Trim trailing context to max context lines
        trailing = 0
        for i in range(len(current_hunk.lines) - 1, -1, -1):
            if current_hunk.lines[i].startswith(' '):
                trailing += 1
            else:
                break

        if trailing > context:
            to_remove = trailing - context
            current_hunk.lines = current_hunk.lines[:-to_remove]
            current_hunk.old_count -= to_remove
            current_hunk.new_count -= to_remove

        hunks.append(current_hunk)

    return hunks


def format_diff(old_path: str, new_path: str, hunks: List[DiffHunk],
                old_label: str = 'a', new_label: str = 'b') -> str:
    """Format diff hunks as unified diff output."""
    if not hunks:
        return ""

    lines = []
    lines.append(f"diff --git {old_label}/{old_path} {new_label}/{new_path}")
    lines.append(f"--- {old_label}/{old_path}")
    lines.append(f"+++ {new_label}/{new_path}")

    for hunk in hunks:
        old_range = f"{hunk.old_start},{hunk.old_count}" if hunk.old_count != 1 else str(hunk.old_start)
        new_range = f"{hunk.new_start},{hunk.new_count}" if hunk.new_count != 1 else str(hunk.new_start)
        lines.append(f"@@ -{old_range} +{new_range} @@")
        lines.extend(hunk.lines)

    return '\n'.join(lines)


def diff_files(old_content: Optional[str], new_content: Optional[str],
               old_path: str, new_path: str = None,
               context: int = 3) -> str:
    """
    Compute unified diff between two file contents.
    Returns empty string if no changes.
    """
    if new_path is None:
        new_path = old_path

    if old_content is None:
        old_lines = []
    else:
        old_lines = old_content.splitlines()

    if new_content is None:
        new_lines = []
    else:
        new_lines = new_content.splitlines()

    if old_lines == new_lines:
        return ""

    diff_ops = myers_diff(old_lines, new_lines)
    hunks = compute_hunks(diff_ops, context)

    return format_diff(old_path, new_path, hunks)


def diff_binary() -> str:
    """Return message for binary file diff."""
    return "Binary files differ"
