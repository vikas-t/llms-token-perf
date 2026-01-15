"""Patch creation and application for diffmerge library."""

import re
from typing import List, Optional
from .types import (
    ApplyResult, ParsedPatch, PatchHunk, PatchLine, PatchOptions, ParseError
)
from .diff import diff_lines
from .utils import split_lines


def create_patch(old: str, new: str, options: Optional[PatchOptions] = None) -> str:
    """Generate unified diff format patch.

    Args:
        old: Original content
        new: New content
        options: Patch options (old_file, new_file, context_lines)

    Returns:
        Unified diff format string
    """
    opts = options or {}
    old_file = opts.get("old_file", "a")
    new_file = opts.get("new_file", "b")
    context_lines = opts.get("context_lines", 3)

    old_lines = split_lines(old)
    new_lines = split_lines(new)

    # Get diff with unlimited context (we'll filter ourselves)
    diff_result = diff_lines(old, new, {"context_lines": max(len(old_lines), len(new_lines))})
    hunks = diff_result["hunks"]

    if not hunks or all(h["op"] == "equal" for h in hunks):
        # No changes - minimal patch
        return f"--- {old_file}\n+++ {new_file}\n"

    # Find change indices
    change_indices = [i for i, h in enumerate(hunks) if h["op"] != "equal"]
    if not change_indices:
        return f"--- {old_file}\n+++ {new_file}\n"

    # Group changes into hunks based on context
    hunk_groups = []
    current_group = [change_indices[0]]

    for i in range(1, len(change_indices)):
        # If close enough, add to current group
        if change_indices[i] - current_group[-1] <= context_lines * 2 + 1:
            current_group.append(change_indices[i])
        else:
            hunk_groups.append(current_group)
            current_group = [change_indices[i]]
    hunk_groups.append(current_group)

    # Build patch hunks
    result_lines = [f"--- {old_file}", f"+++ {new_file}"]

    for group in hunk_groups:
        # Determine range with context
        start_idx = max(0, group[0] - context_lines)
        end_idx = min(len(hunks), group[-1] + context_lines + 1)

        # Collect lines for this hunk
        hunk_content: List[PatchLine] = []
        old_start = None
        new_start = None

        for i in range(start_idx, end_idx):
            h = hunks[i]
            content = h["content"]

            # Strip trailing newline for output
            if content.endswith("\n"):
                content = content[:-1]
            elif content.endswith("\r\n"):
                content = content[:-2]
            elif content.endswith("\r"):
                content = content[:-1]

            if h["op"] == "equal":
                if old_start is None:
                    old_start = h.get("old_start", 1)
                    new_start = h.get("new_start", 1)
                hunk_content.append({"op": " ", "content": content})
            elif h["op"] == "delete":
                if old_start is None:
                    old_start = h.get("old_start", 1)
                    new_start = old_start  # Approximation
                hunk_content.append({"op": "-", "content": content})
            elif h["op"] == "insert":
                if new_start is None:
                    new_start = h.get("new_start", 1)
                    old_start = new_start  # Approximation
                hunk_content.append({"op": "+", "content": content})

        # Count lines for header
        old_count = sum(1 for l in hunk_content if l["op"] in (" ", "-"))
        new_count = sum(1 for l in hunk_content if l["op"] in (" ", "+"))

        if old_start is None:
            old_start = 1
        if new_start is None:
            new_start = 1

        result_lines.append(f"@@ -{old_start},{old_count} +{new_start},{new_count} @@")
        for pl in hunk_content:
            result_lines.append(f"{pl['op']}{pl['content']}")

    return "\n".join(result_lines) + "\n"


def _group_into_patch_hunks(
    diff_hunks: List,
    old_lines: List[str],
    new_lines: List[str],
    context_lines: int
) -> List[PatchHunk]:
    """Group diff hunks into patch hunks with proper context."""
    if not diff_hunks:
        return []

    # Find ranges of changes
    change_ranges = []
    current_range = None

    for h in diff_hunks:
        if h["op"] != "equal":
            old_idx = h.get("old_start", 0)
            new_idx = h.get("new_start", 0)
            if current_range is None:
                current_range = {
                    "old_start": old_idx,
                    "old_end": old_idx + h.get("old_count", 0),
                    "new_start": new_idx,
                    "new_end": new_idx + h.get("new_count", 0)
                }
            else:
                # Check if this change is within context of previous
                if h["op"] == "delete":
                    if old_idx <= current_range["old_end"] + context_lines * 2:
                        current_range["old_end"] = max(
                            current_range["old_end"],
                            old_idx + h.get("old_count", 0)
                        )
                        current_range["new_end"] = max(current_range["new_end"], new_idx)
                    else:
                        change_ranges.append(current_range)
                        current_range = {
                            "old_start": old_idx,
                            "old_end": old_idx + h.get("old_count", 0),
                            "new_start": new_idx,
                            "new_end": new_idx
                        }
                else:  # insert
                    if new_idx <= current_range["new_end"] + context_lines * 2:
                        current_range["new_end"] = max(
                            current_range["new_end"],
                            new_idx + h.get("new_count", 0)
                        )
                        current_range["old_end"] = max(current_range["old_end"], old_idx)
                    else:
                        change_ranges.append(current_range)
                        current_range = {
                            "old_start": old_idx,
                            "old_end": old_idx,
                            "new_start": new_idx,
                            "new_end": new_idx + h.get("new_count", 0)
                        }

    if current_range:
        change_ranges.append(current_range)

    # Build patch hunks with context
    patch_hunks = []
    for range_info in change_ranges:
        # Calculate bounds with context
        old_start = max(1, range_info["old_start"] - context_lines)
        old_end = min(len(old_lines), range_info["old_end"] + context_lines)
        new_start = max(1, range_info["new_start"] - context_lines)
        new_end = min(len(new_lines), range_info["new_end"] + context_lines)

        # Build hunk using diff hunks that fall within range
        hunk_lines: List[PatchLine] = []

        # We need to reconstruct the patch lines properly
        # Iterate through the diff hunks and build patch lines
        old_idx = old_start
        new_idx = new_start

        for h in diff_hunks:
            h_old_start = h.get("old_start", 0)
            h_new_start = h.get("new_start", 0)

            if h["op"] == "equal":
                if h_old_start >= old_start and h_old_start <= old_end:
                    hunk_lines.append({"op": " ", "content": h["content"]})
            elif h["op"] == "delete":
                if h_old_start >= old_start and h_old_start <= old_end:
                    hunk_lines.append({"op": "-", "content": h["content"]})
            elif h["op"] == "insert":
                if h_new_start >= new_start and h_new_start <= new_end:
                    hunk_lines.append({"op": "+", "content": h["content"]})

        # Count lines for header
        context_count = sum(1 for l in hunk_lines if l["op"] == " ")
        delete_count = sum(1 for l in hunk_lines if l["op"] == "-")
        insert_count = sum(1 for l in hunk_lines if l["op"] == "+")

        patch_hunks.append({
            "old_start": old_start,
            "old_count": context_count + delete_count,
            "new_start": new_start,
            "new_count": context_count + insert_count,
            "lines": hunk_lines
        })

    return patch_hunks


def apply_patch(content: str, patch: str) -> ApplyResult:
    """Apply a unified diff patch to content.

    Args:
        content: Content to patch
        patch: Unified diff patch

    Returns:
        ApplyResult with patched content and status
    """
    try:
        parsed = parse_patch(patch)
    except ParseError as e:
        return {
            "content": content,
            "success": False,
            "hunks_applied": 0,
            "hunks_failed": 0,
            "errors": [str(e)]
        }

    if not parsed["hunks"]:
        return {
            "content": content,
            "success": True,
            "hunks_applied": 0,
            "hunks_failed": 0,
            "errors": []
        }

    lines = split_lines(content)
    hunks_applied = 0
    hunks_failed = 0
    errors: List[str] = []

    # Apply hunks in reverse order to preserve line numbers
    for hunk in reversed(parsed["hunks"]):
        success, new_lines, error = _apply_hunk(lines, hunk)
        if success:
            lines = new_lines
            hunks_applied += 1
        else:
            hunks_failed += 1
            if error:
                errors.append(error)

    result_content = "".join(lines)

    return {
        "content": result_content,
        "success": hunks_failed == 0,
        "hunks_applied": hunks_applied,
        "hunks_failed": hunks_failed,
        "errors": errors
    }


def _apply_hunk(
    lines: List[str],
    hunk: PatchHunk
) -> tuple:
    """Apply a single hunk to lines.

    Returns (success, new_lines, error_message)
    """
    old_start = hunk["old_start"] - 1  # Convert to 0-indexed
    hunk_lines = hunk["lines"]

    # Extract expected context and deletions
    expected = []
    for pl in hunk_lines:
        if pl["op"] in (" ", "-"):
            expected.append(pl["content"])

    # Try to find match at expected position
    match_pos = _find_hunk_match(lines, expected, old_start)

    if match_pos < 0:
        return False, lines, f"Hunk at line {hunk['old_start']} doesn't match"

    # Apply the hunk
    new_lines = lines[:match_pos]
    expected_idx = 0

    for pl in hunk_lines:
        if pl["op"] == " ":
            # Context line - keep from expected position
            if match_pos + expected_idx < len(lines):
                new_lines.append(lines[match_pos + expected_idx])
            expected_idx += 1
        elif pl["op"] == "-":
            # Delete - skip this line
            expected_idx += 1
        elif pl["op"] == "+":
            # Insert - add new line
            content = pl["content"]
            if not content.endswith("\n"):
                content += "\n"
            new_lines.append(content)

    # Add remaining lines
    new_lines.extend(lines[match_pos + expected_idx:])

    return True, new_lines, None


def _find_hunk_match(
    lines: List[str],
    expected: List[str],
    start_pos: int
) -> int:
    """Find position where expected lines match in content.

    Returns match position or -1 if not found.
    """
    if not expected:
        return start_pos

    # Normalize lines for comparison
    def normalize(line: str) -> str:
        if line.endswith("\n"):
            return line[:-1]
        if line.endswith("\r\n"):
            return line[:-2]
        if line.endswith("\r"):
            return line[:-1]
        return line

    expected_normalized = [normalize(e) for e in expected]

    # Try exact position first
    if start_pos >= 0 and start_pos + len(expected) <= len(lines):
        match = True
        for i, exp in enumerate(expected_normalized):
            if normalize(lines[start_pos + i]) != exp:
                match = False
                break
        if match:
            return start_pos

    # Try fuzzy match (search nearby)
    for offset in range(1, len(lines) + 1):
        for pos in [start_pos - offset, start_pos + offset]:
            if pos >= 0 and pos + len(expected) <= len(lines):
                match = True
                for i, exp in enumerate(expected_normalized):
                    if normalize(lines[pos + i]) != exp:
                        match = False
                        break
                if match:
                    return pos

    return -1


def reverse_patch(patch: str) -> str:
    """Reverse a patch (swap additions and deletions).

    Args:
        patch: Unified diff patch

    Returns:
        Reversed patch
    """
    parsed = parse_patch(patch)

    # Swap file names
    old_file = parsed["new_file"]
    new_file = parsed["old_file"]

    lines = [f"--- {old_file}", f"+++ {new_file}"]

    for hunk in parsed["hunks"]:
        # Swap line counts
        old_start = hunk["new_start"]
        old_count = hunk["new_count"]
        new_start = hunk["old_start"]
        new_count = hunk["old_count"]
        lines.append(f"@@ -{old_start},{old_count} +{new_start},{new_count} @@")

        # Reverse operations
        for pline in hunk["lines"]:
            content = pline["content"]
            if content.endswith("\n"):
                content = content[:-1]

            if pline["op"] == "+":
                lines.append(f"-{content}")
            elif pline["op"] == "-":
                lines.append(f"+{content}")
            else:
                lines.append(f" {content}")

    return "\n".join(lines) + "\n"


def parse_patch(patch: str) -> ParsedPatch:
    """Parse unified diff format into structured data.

    Args:
        patch: Unified diff patch string

    Returns:
        ParsedPatch structure

    Raises:
        ParseError: If patch format is invalid
    """
    lines = patch.split("\n")

    old_file = ""
    new_file = ""
    hunks: List[PatchHunk] = []

    i = 0
    while i < len(lines):
        line = lines[i]

        if line.startswith("---"):
            # Old file header
            old_file = line[4:].strip()
            i += 1
        elif line.startswith("+++"):
            # New file header
            new_file = line[4:].strip()
            i += 1
        elif line.startswith("@@"):
            # Hunk header
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if not match:
                raise ParseError(f"Invalid hunk header: {line}")

            old_start = int(match.group(1))
            old_count = int(match.group(2)) if match.group(2) else 1
            new_start = int(match.group(3))
            new_count = int(match.group(4)) if match.group(4) else 1

            # Parse hunk lines
            hunk_lines: List[PatchLine] = []
            i += 1

            while i < len(lines):
                hline = lines[i]
                if not hline:
                    i += 1
                    continue
                if hline.startswith("@@") or hline.startswith("---") or hline.startswith("+++"):
                    break
                if hline.startswith(" "):
                    hunk_lines.append({"op": " ", "content": hline[1:] + "\n"})
                elif hline.startswith("+"):
                    hunk_lines.append({"op": "+", "content": hline[1:] + "\n"})
                elif hline.startswith("-"):
                    hunk_lines.append({"op": "-", "content": hline[1:] + "\n"})
                elif hline.startswith("\\"):
                    # "\ No newline at end of file" marker
                    pass
                else:
                    # Might be end of patch or unrecognized line
                    break
                i += 1

            hunks.append({
                "old_start": old_start,
                "old_count": old_count,
                "new_start": new_start,
                "new_count": new_count,
                "lines": hunk_lines
            })
        else:
            i += 1

    if not old_file and not new_file and not hunks:
        raise ParseError("Invalid patch format: no headers or hunks found")

    return {
        "old_file": old_file,
        "new_file": new_file,
        "hunks": hunks
    }
