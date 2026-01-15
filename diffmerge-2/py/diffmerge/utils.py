"""Utility functions for diffmerge library."""

from typing import List
from .types import DiffResult, DiffStats


def get_stats(diff: DiffResult) -> DiffStats:
    """Get statistics from a diff result."""
    return diff["stats"]


def is_binary(content: str) -> bool:
    """Detect if content appears to be binary (contains null bytes)."""
    return "\x00" in content


def normalize_line_endings(content: str) -> str:
    """Convert all line endings to LF (\\n)."""
    # First convert CRLF to LF
    result = content.replace("\r\n", "\n")
    # Then convert remaining CR to LF
    result = result.replace("\r", "\n")
    return result


def split_lines(content: str) -> List[str]:
    """Split content into lines, preserving empty trailing line if present.

    Each line includes its line ending character.
    """
    if not content:
        return []

    lines = []
    current = ""

    i = 0
    while i < len(content):
        char = content[i]
        if char == "\r":
            if i + 1 < len(content) and content[i + 1] == "\n":
                # CRLF
                current += "\r\n"
                lines.append(current)
                current = ""
                i += 2
            else:
                # Just CR
                current += "\r"
                lines.append(current)
                current = ""
                i += 1
        elif char == "\n":
            current += "\n"
            lines.append(current)
            current = ""
            i += 1
        else:
            current += char
            i += 1

    # Handle any remaining content (line without newline at end)
    if current:
        lines.append(current)

    return lines
