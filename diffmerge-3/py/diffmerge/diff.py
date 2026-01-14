"""Diff algorithms for the diffmerge library."""

import re
from typing import List, Optional, Dict, Any, Tuple
from .types import DiffHunk, DiffResult, DiffStats, DiffOptions


def _compute_lcs(old_items: List[str], new_items: List[str],
                 ignore_whitespace: bool = False) -> List[Tuple[int, int]]:
    """Compute the Longest Common Subsequence using dynamic programming.

    Returns list of (old_index, new_index) pairs for matching items.
    """
    m, n = len(old_items), len(new_items)

    if m == 0 or n == 0:
        return []

    def items_equal(a: str, b: str) -> bool:
        if ignore_whitespace:
            return a.strip() == b.strip()
        return a == b

    # Build DP table
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if items_equal(old_items[i - 1], new_items[j - 1]):
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to find the LCS
    lcs = []
    i, j = m, n
    while i > 0 and j > 0:
        if items_equal(old_items[i - 1], new_items[j - 1]):
            lcs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif dp[i - 1][j] > dp[i][j - 1]:
            i -= 1
        else:
            j -= 1

    lcs.reverse()
    return lcs


def _build_diff_hunks(old_items: List[str], new_items: List[str],
                      lcs: List[Tuple[int, int]],
                      ignore_whitespace: bool = False) -> List[DiffHunk]:
    """Build diff hunks from LCS result."""
    hunks = []
    old_idx = 0
    new_idx = 0
    lcs_idx = 0

    def items_equal(a: str, b: str) -> bool:
        if ignore_whitespace:
            return a.strip() == b.strip()
        return a == b

    while old_idx < len(old_items) or new_idx < len(new_items):
        if lcs_idx < len(lcs):
            lcs_old, lcs_new = lcs[lcs_idx]

            # Delete items before the LCS match
            while old_idx < lcs_old:
                hunks.append(DiffHunk(
                    op="delete",
                    content=old_items[old_idx],
                    old_start=old_idx + 1,
                    old_count=1,
                ))
                old_idx += 1

            # Insert items before the LCS match
            while new_idx < lcs_new:
                hunks.append(DiffHunk(
                    op="insert",
                    content=new_items[new_idx],
                    new_start=new_idx + 1,
                    new_count=1,
                ))
                new_idx += 1

            # Equal item (LCS match)
            hunks.append(DiffHunk(
                op="equal",
                content=new_items[new_idx],  # Use new content
                old_start=old_idx + 1,
                new_start=new_idx + 1,
            ))
            old_idx += 1
            new_idx += 1
            lcs_idx += 1
        else:
            # Remaining deletions
            while old_idx < len(old_items):
                hunks.append(DiffHunk(
                    op="delete",
                    content=old_items[old_idx],
                    old_start=old_idx + 1,
                    old_count=1,
                ))
                old_idx += 1

            # Remaining insertions
            while new_idx < len(new_items):
                hunks.append(DiffHunk(
                    op="insert",
                    content=new_items[new_idx],
                    new_start=new_idx + 1,
                    new_count=1,
                ))
                new_idx += 1

    return hunks


def _calculate_stats(hunks: List[DiffHunk]) -> DiffStats:
    """Calculate statistics from diff hunks."""
    additions = 0
    deletions = 0

    for hunk in hunks:
        if hunk.op == "insert":
            additions += 1
        elif hunk.op == "delete":
            deletions += 1

    return DiffStats(additions=additions, deletions=deletions, changes=min(additions, deletions))


def _filter_hunks_by_context(hunks: List[DiffHunk], context_lines: int) -> List[DiffHunk]:
    """Filter equal hunks to only include those within context_lines of changes."""
    if not hunks:
        return hunks

    # Find indices of non-equal hunks
    change_indices = set()
    for i, h in enumerate(hunks):
        if h.op != "equal":
            change_indices.add(i)

    if not change_indices:
        # All equal - return minimal hunks
        return hunks

    # Include equal hunks within context_lines of changes
    include_indices = set(change_indices)
    for ci in change_indices:
        for offset in range(1, context_lines + 1):
            if ci - offset >= 0:
                include_indices.add(ci - offset)
            if ci + offset < len(hunks):
                include_indices.add(ci + offset)

    return [h for i, h in enumerate(hunks) if i in include_indices]


def _split_lines(content: str) -> List[str]:
    """Split content into lines for diff comparison."""
    if not content:
        return []

    # Normalize line endings first
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")

    # Split by newlines, keeping each line separate
    if normalized.endswith("\n"):
        lines = normalized[:-1].split("\n")
    else:
        lines = normalized.split("\n")

    return lines


def _filter_blank_lines(lines: List[str]) -> Tuple[List[str], List[int]]:
    """Filter out blank lines, returning filtered list and original indices."""
    filtered = []
    indices = []
    for i, line in enumerate(lines):
        if line.strip():
            filtered.append(line)
            indices.append(i)
    return filtered, indices


def diff_lines(old: str, new: str, options: Optional[Dict[str, Any]] = None) -> dict:
    """Compute line-by-line diff using LCS algorithm.

    Args:
        old: Original content
        new: New content
        options: Optional dict with:
            - ignore_whitespace: Ignore leading/trailing whitespace
            - ignore_blank_lines: Skip blank lines in comparison
            - context_lines: Number of context lines around changes

    Returns:
        Dict with 'hunks' and 'stats' keys
    """
    opts = DiffOptions()
    if options:
        if "ignore_whitespace" in options:
            opts.ignore_whitespace = options["ignore_whitespace"]
        if "ignore_blank_lines" in options:
            opts.ignore_blank_lines = options["ignore_blank_lines"]
        if "context_lines" in options:
            opts.context_lines = options["context_lines"]

    old_lines = _split_lines(old)
    new_lines = _split_lines(new)

    if opts.ignore_blank_lines:
        # Filter blank lines for comparison - only compare non-blank lines
        old_filtered, _ = _filter_blank_lines(old_lines)
        new_filtered, _ = _filter_blank_lines(new_lines)

        # Compute LCS and hunks on filtered lines
        lcs = _compute_lcs(old_filtered, new_filtered, opts.ignore_whitespace)
        hunks = _build_diff_hunks(old_filtered, new_filtered, lcs, opts.ignore_whitespace)
    else:
        lcs = _compute_lcs(old_lines, new_lines, opts.ignore_whitespace)
        hunks = _build_diff_hunks(old_lines, new_lines, lcs, opts.ignore_whitespace)

    # Filter by context
    if opts.context_lines < len(hunks):
        hunks = _filter_hunks_by_context(hunks, opts.context_lines)

    stats = _calculate_stats(hunks)

    result = DiffResult(hunks=hunks, stats=stats)
    return result.to_dict()


def diff_words(old: str, new: str) -> List[dict]:
    """Compute word-by-word diff.

    Args:
        old: Original text
        new: New text

    Returns:
        List of hunks with 'op' and 'content'
    """
    # Split into words and whitespace tokens
    def tokenize(text: str) -> List[str]:
        # Split on word boundaries, keeping whitespace and punctuation
        tokens = re.findall(r'\S+|\s+', text)
        return tokens

    old_tokens = tokenize(old)
    new_tokens = tokenize(new)

    lcs = _compute_lcs(old_tokens, new_tokens)
    hunks = _build_diff_hunks(old_tokens, new_tokens, lcs)

    return [h.to_dict() for h in hunks]


def diff_chars(old: str, new: str) -> List[dict]:
    """Compute character-by-character diff.

    Args:
        old: Original text
        new: New text

    Returns:
        List of hunks with 'op' and 'content'
    """
    old_chars = list(old)
    new_chars = list(new)

    lcs = _compute_lcs(old_chars, new_chars)
    raw_hunks = _build_diff_hunks(old_chars, new_chars, lcs)

    # Merge consecutive hunks of the same type
    merged = []
    for hunk in raw_hunks:
        if merged and merged[-1].op == hunk.op:
            merged[-1].content += hunk.content
        else:
            merged.append(DiffHunk(op=hunk.op, content=hunk.content))

    return [h.to_dict() for h in merged]
