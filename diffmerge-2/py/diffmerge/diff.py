"""Diff algorithms for diffmerge library."""

import re
from typing import List, Optional, Tuple
from .types import DiffHunk, DiffResult, DiffStats, DiffOptions
from .utils import split_lines


def _lcs(a: List[str], b: List[str]) -> List[Tuple[int, int]]:
    """Compute Longest Common Subsequence using dynamic programming.

    Returns list of (index_in_a, index_in_b) pairs for matching elements.
    """
    m, n = len(a), len(b)

    if m == 0 or n == 0:
        return []

    # Build LCS length table
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to find LCS
    result = []
    i, j = m, n
    while i > 0 and j > 0:
        if a[i - 1] == b[j - 1]:
            result.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif dp[i - 1][j] > dp[i][j - 1]:
            i -= 1
        else:
            j -= 1

    result.reverse()
    return result


def _normalize_line(line: str, ignore_whitespace: bool) -> str:
    """Normalize a line for comparison."""
    if ignore_whitespace:
        return line.strip()
    return line


def _lines_equal(a: str, b: str, ignore_whitespace: bool) -> bool:
    """Check if two lines are equal, optionally ignoring whitespace."""
    if ignore_whitespace:
        return a.strip() == b.strip()
    return a == b


def diff_lines(old: str, new: str, options: Optional[DiffOptions] = None) -> DiffResult:
    """Compute line-by-line diff using LCS algorithm.

    Args:
        old: Original content
        new: New content
        options: Diff options (ignore_whitespace, ignore_blank_lines, context_lines)

    Returns:
        DiffResult with hunks and stats
    """
    opts = options or {}
    ignore_whitespace = opts.get("ignore_whitespace", False)
    ignore_blank_lines = opts.get("ignore_blank_lines", False)
    context_lines = opts.get("context_lines", 3)

    old_lines = split_lines(old)
    new_lines = split_lines(new)

    # For comparison, optionally normalize lines
    def should_include(line: str) -> bool:
        if ignore_blank_lines and line.strip() == "":
            return False
        return True

    # Create filtered versions for LCS comparison
    if ignore_blank_lines:
        old_filtered = [(i, line) for i, line in enumerate(old_lines) if should_include(line)]
        new_filtered = [(i, line) for i, line in enumerate(new_lines) if should_include(line)]
    else:
        old_filtered = [(i, line) for i, line in enumerate(old_lines)]
        new_filtered = [(i, line) for i, line in enumerate(new_lines)]

    # Normalize for comparison
    old_compare = [_normalize_line(line, ignore_whitespace) for _, line in old_filtered]
    new_compare = [_normalize_line(line, ignore_whitespace) for _, line in new_filtered]

    # Compute LCS on filtered/normalized lines
    lcs = _lcs(old_compare, new_compare)

    # Convert LCS indices back to original indices
    lcs_original = []
    for old_idx, new_idx in lcs:
        orig_old_idx = old_filtered[old_idx][0]
        orig_new_idx = new_filtered[new_idx][0]
        lcs_original.append((orig_old_idx, orig_new_idx))

    # Build diff hunks from LCS
    hunks: List[DiffHunk] = []
    old_pos = 0
    new_pos = 0

    for old_idx, new_idx in lcs_original:
        # Add deletions (lines in old not in LCS)
        while old_pos < old_idx:
            hunks.append({
                "op": "delete",
                "content": old_lines[old_pos],
                "old_start": old_pos + 1,
                "old_count": 1
            })
            old_pos += 1

        # Add insertions (lines in new not in LCS)
        while new_pos < new_idx:
            hunks.append({
                "op": "insert",
                "content": new_lines[new_pos],
                "new_start": new_pos + 1,
                "new_count": 1
            })
            new_pos += 1

        # Add equal line
        hunks.append({
            "op": "equal",
            "content": new_lines[new_pos],
            "old_start": old_pos + 1,
            "new_start": new_pos + 1,
            "old_count": 1,
            "new_count": 1
        })
        old_pos += 1
        new_pos += 1

    # Handle remaining lines after last LCS match
    while old_pos < len(old_lines):
        hunks.append({
            "op": "delete",
            "content": old_lines[old_pos],
            "old_start": old_pos + 1,
            "old_count": 1
        })
        old_pos += 1

    while new_pos < len(new_lines):
        hunks.append({
            "op": "insert",
            "content": new_lines[new_pos],
            "new_start": new_pos + 1,
            "new_count": 1
        })
        new_pos += 1

    # Apply context_lines filtering if specified
    if context_lines >= 0 and hunks:
        hunks = _filter_context(hunks, context_lines)

    # Calculate stats (excluding blank lines if ignore_blank_lines is True)
    def should_count(h: DiffHunk) -> bool:
        if ignore_blank_lines and h["content"].strip() == "":
            return False
        return True

    additions = sum(1 for h in hunks if h["op"] == "insert" and should_count(h))
    deletions = sum(1 for h in hunks if h["op"] == "delete" and should_count(h))

    stats: DiffStats = {
        "additions": additions,
        "deletions": deletions,
        "changes": min(additions, deletions)
    }

    return {"hunks": hunks, "stats": stats}


def _filter_context(hunks: List[DiffHunk], context_lines: int) -> List[DiffHunk]:
    """Filter hunks to only include equal lines within context_lines of changes."""
    if not hunks:
        return hunks

    # Mark indices of change hunks
    change_indices = set()
    for i, h in enumerate(hunks):
        if h["op"] != "equal":
            change_indices.add(i)

    # Mark equal lines within context_lines of changes
    include_indices = set()
    for i in change_indices:
        include_indices.add(i)
        # Add context before
        for j in range(max(0, i - context_lines), i):
            include_indices.add(j)
        # Add context after
        for j in range(i + 1, min(len(hunks), i + context_lines + 1)):
            include_indices.add(j)

    return [hunks[i] for i in sorted(include_indices)]


def diff_words(old: str, new: str) -> List[DiffHunk]:
    """Compute word-by-word diff.

    Args:
        old: Original text
        new: New text

    Returns:
        List of DiffHunks
    """
    # Split into tokens (words and punctuation/whitespace)
    def tokenize(text: str) -> List[str]:
        # Split on word boundaries, keeping delimiters
        tokens = re.split(r'(\s+|\b)', text)
        return [t for t in tokens if t]

    old_tokens = tokenize(old)
    new_tokens = tokenize(new)

    lcs = _lcs(old_tokens, new_tokens)

    hunks: List[DiffHunk] = []
    old_pos = 0
    new_pos = 0

    for old_idx, new_idx in lcs:
        # Deletions
        if old_pos < old_idx:
            deleted = "".join(old_tokens[old_pos:old_idx])
            hunks.append({"op": "delete", "content": deleted})
            old_pos = old_idx

        # Insertions
        if new_pos < new_idx:
            inserted = "".join(new_tokens[new_pos:new_idx])
            hunks.append({"op": "insert", "content": inserted})
            new_pos = new_idx

        # Equal
        hunks.append({"op": "equal", "content": old_tokens[old_pos]})
        old_pos += 1
        new_pos += 1

    # Remaining deletions
    if old_pos < len(old_tokens):
        deleted = "".join(old_tokens[old_pos:])
        hunks.append({"op": "delete", "content": deleted})

    # Remaining insertions
    if new_pos < len(new_tokens):
        inserted = "".join(new_tokens[new_pos:])
        hunks.append({"op": "insert", "content": inserted})

    return hunks


def diff_chars(old: str, new: str) -> List[DiffHunk]:
    """Compute character-by-character diff.

    Args:
        old: Original text
        new: New text

    Returns:
        List of DiffHunks
    """
    old_chars = list(old)
    new_chars = list(new)

    lcs = _lcs(old_chars, new_chars)

    hunks: List[DiffHunk] = []
    old_pos = 0
    new_pos = 0

    for old_idx, new_idx in lcs:
        # Deletions
        if old_pos < old_idx:
            deleted = "".join(old_chars[old_pos:old_idx])
            hunks.append({"op": "delete", "content": deleted})
            old_pos = old_idx

        # Insertions
        if new_pos < new_idx:
            inserted = "".join(new_chars[new_pos:new_idx])
            hunks.append({"op": "insert", "content": inserted})
            new_pos = new_idx

        # Equal - accumulate consecutive equal chars
        if hunks and hunks[-1]["op"] == "equal":
            hunks[-1]["content"] += old_chars[old_pos]
        else:
            hunks.append({"op": "equal", "content": old_chars[old_pos]})
        old_pos += 1
        new_pos += 1

    # Remaining deletions
    if old_pos < len(old_chars):
        deleted = "".join(old_chars[old_pos:])
        hunks.append({"op": "delete", "content": deleted})

    # Remaining insertions
    if new_pos < len(new_chars):
        inserted = "".join(new_chars[new_pos:])
        hunks.append({"op": "insert", "content": inserted})

    return hunks
