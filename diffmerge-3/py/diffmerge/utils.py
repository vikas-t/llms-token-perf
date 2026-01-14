"""Utility functions for the diffmerge library."""

from typing import List
from .types import DiffResult, DiffStats


def get_stats(diff: DiffResult) -> DiffStats:
    """Get statistics from a diff result."""
    return diff.stats


def is_binary(content: str) -> bool:
    """Detect if content appears to be binary (contains null bytes)."""
    return "\x00" in content


def normalize_line_endings(content: str) -> str:
    """Convert all line endings to LF (\\n)."""
    # First convert CRLF to LF, then CR to LF
    result = content.replace("\r\n", "\n").replace("\r", "\n")
    return result


def split_lines(content: str) -> List[str]:
    """Split content into lines, preserving empty trailing line if present.

    Each line includes its newline character if present.
    """
    if not content:
        return []

    lines = []
    start = 0
    i = 0

    while i < len(content):
        if content[i] == "\n":
            lines.append(content[start:i + 1])
            start = i + 1
        elif content[i] == "\r":
            if i + 1 < len(content) and content[i + 1] == "\n":
                lines.append(content[start:i + 2])
                start = i + 2
                i += 1
            else:
                lines.append(content[start:i + 1])
                start = i + 1
        i += 1

    # Handle remaining content without trailing newline
    if start < len(content):
        lines.append(content[start:])

    return lines


def split_lines_normalized(content: str) -> List[str]:
    """Split content into lines for comparison (without line endings)."""
    if not content:
        return []

    # Normalize first
    normalized = normalize_line_endings(content)

    # Split by newline
    if normalized.endswith("\n"):
        lines = normalized[:-1].split("\n")
    else:
        lines = normalized.split("\n")

    return lines


def lines_equal(line1: str, line2: str, ignore_whitespace: bool = False) -> bool:
    """Compare two lines, optionally ignoring whitespace."""
    if ignore_whitespace:
        return line1.strip() == line2.strip()
    return line1 == line2
