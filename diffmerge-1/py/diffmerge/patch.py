"""Patch functionality for the diffmerge library."""

import re
from typing import Optional, Dict, Any, List
from .types import (
    ApplyResult, ParsedPatch, PatchHunk, PatchLine,
    PatchOptions, ParseError
)
from .diff import diff_lines
from .utils import split_lines


def create_patch(old: str, new: str, options: Optional[Dict[str, Any]] = None) -> str:
    """Generate unified diff format patch.

    Args:
        old: Original content
        new: New content
        options: Optional dict with keys:
            - old_file: Name of old file (default: "a")
            - new_file: Name of new file (default: "b")
            - context_lines: Context lines (default: 3)

    Returns:
        Unified diff format string
    """
    opts = options or {}
    old_file = opts.get("old_file", "a")
    new_file = opts.get("new_file", "b")
    context_lines = opts.get("context_lines", 3)

    diff_result = diff_lines(old, new, {"context_lines": context_lines})
    hunks = diff_result["hunks"]

    if not hunks:
        # Both empty
        return f"--- {old_file}\n+++ {new_file}\n"

    # Check if there are any changes
    has_changes = any(h["op"] != "equal" for h in hunks)
    if not has_changes:
        return f"--- {old_file}\n+++ {new_file}\n"

    # Group hunks into unified diff hunks with context
    result_lines = [f"--- {old_file}", f"+++ {new_file}"]

    # Find change regions and expand with context
    change_indices = [i for i, h in enumerate(hunks) if h["op"] != "equal"]

    if not change_indices:
        return f"--- {old_file}\n+++ {new_file}\n"

    # Group changes that are close enough to share context
    groups = []
    current_group = [change_indices[0]]

    for i in range(1, len(change_indices)):
        # If this change is within 2*context_lines of the previous, group them
        if change_indices[i] - change_indices[i-1] <= 2 * context_lines:
            current_group.append(change_indices[i])
        else:
            groups.append(current_group)
            current_group = [change_indices[i]]
    groups.append(current_group)

    # Generate a unified hunk for each group
    for group in groups:
        # Calculate range with context
        start = max(0, group[0] - context_lines)
        end = min(len(hunks), group[-1] + context_lines + 1)

        # Calculate line numbers for the hunk header
        # old_start: starting line in old file
        # new_start: starting line in new file
        old_start = 1
        new_start = 1

        for i in range(start):
            if hunks[i]["op"] == "equal":
                old_start += 1
                new_start += 1
            elif hunks[i]["op"] == "delete":
                old_start += 1
            else:  # insert
                new_start += 1

        # Count lines in this hunk
        old_count = 0
        new_count = 0
        hunk_lines = []

        for i in range(start, end):
            h = hunks[i]
            content = h["content"]
            # Remove trailing newline for display, we'll add it back
            if content.endswith("\n"):
                line_content = content[:-1]
            elif content.endswith("\r\n"):
                line_content = content[:-2]
            elif content.endswith("\r"):
                line_content = content[:-1]
            else:
                line_content = content

            if h["op"] == "equal":
                hunk_lines.append(f" {line_content}")
                old_count += 1
                new_count += 1
            elif h["op"] == "delete":
                hunk_lines.append(f"-{line_content}")
                old_count += 1
            else:  # insert
                hunk_lines.append(f"+{line_content}")
                new_count += 1

        # Generate hunk header
        if old_count == 0:
            old_start = max(old_start - 1, 0)  # Point to line before insertion
        if new_count == 0:
            new_start = max(new_start - 1, 0)

        header = f"@@ -{old_start},{old_count} +{new_start},{new_count} @@"
        result_lines.append(header)
        result_lines.extend(hunk_lines)

    return "\n".join(result_lines) + "\n"


def parse_patch(patch: str) -> ParsedPatch:
    """Parse unified diff format into structured data.

    Args:
        patch: Unified diff format string

    Returns:
        ParsedPatch with file names and hunks

    Raises:
        ParseError: If the patch format is invalid
    """
    lines = patch.split("\n")

    old_file = ""
    new_file = ""
    hunks: List[PatchHunk] = []

    i = 0

    # Find file headers
    while i < len(lines):
        line = lines[i]
        if line.startswith("---"):
            old_file = line[4:].strip()
            i += 1
            break
        i += 1
    else:
        raise ParseError("No --- header found in patch")

    while i < len(lines):
        line = lines[i]
        if line.startswith("+++"):
            new_file = line[4:].strip()
            i += 1
            break
        i += 1
    else:
        raise ParseError("No +++ header found in patch")

    # Parse hunks
    hunk_header_re = re.compile(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue

        match = hunk_header_re.match(line)
        if match:
            old_start = int(match.group(1))
            old_count = int(match.group(2)) if match.group(2) else 1
            new_start = int(match.group(3))
            new_count = int(match.group(4)) if match.group(4) else 1

            hunk_lines: List[PatchLine] = []
            i += 1

            # Parse lines in this hunk
            expected_old = old_count
            expected_new = new_count

            while i < len(lines) and (expected_old > 0 or expected_new > 0):
                if i >= len(lines):
                    break
                line = lines[i]
                if line.startswith("@@") or line.startswith("---") or line.startswith("+++"):
                    break

                if line.startswith(" "):
                    hunk_lines.append({"op": " ", "content": line[1:]})
                    expected_old -= 1
                    expected_new -= 1
                elif line.startswith("-"):
                    hunk_lines.append({"op": "-", "content": line[1:]})
                    expected_old -= 1
                elif line.startswith("+"):
                    hunk_lines.append({"op": "+", "content": line[1:]})
                    expected_new -= 1
                elif line == "":
                    # Empty context line
                    hunk_lines.append({"op": " ", "content": ""})
                    expected_old -= 1
                    expected_new -= 1
                else:
                    # Might be "\ No newline at end of file" or other marker
                    pass
                i += 1

            hunks.append({
                "old_start": old_start,
                "old_count": old_count,
                "new_start": new_start,
                "new_count": new_count,
                "lines": hunk_lines,
            })
        else:
            i += 1

    return {
        "old_file": old_file,
        "new_file": new_file,
        "hunks": hunks,
    }


def apply_patch(content: str, patch: str) -> ApplyResult:
    """Apply a unified diff patch to content.

    Args:
        content: Original content
        patch: Unified diff format patch

    Returns:
        ApplyResult with content and statistics
    """
    errors: List[str] = []

    try:
        parsed = parse_patch(patch)
    except ParseError as e:
        return {
            "content": content,
            "success": False,
            "hunks_applied": 0,
            "hunks_failed": 1,
            "errors": [str(e)],
        }

    # If no hunks, patch is a no-op
    if not parsed["hunks"]:
        return {
            "content": content,
            "success": True,
            "hunks_applied": 0,
            "hunks_failed": 0,
            "errors": [],
        }

    lines = split_lines(content)
    # Normalize lines to not include newlines for comparison
    content_lines = []
    for line in lines:
        if line.endswith("\r\n"):
            content_lines.append(line[:-2])
        elif line.endswith("\n") or line.endswith("\r"):
            content_lines.append(line[:-1])
        else:
            content_lines.append(line)

    hunks_applied = 0
    hunks_failed = 0

    # Apply hunks in reverse order to not mess up line numbers
    offset = 0  # Track cumulative offset from applied hunks

    for hunk in parsed["hunks"]:
        # Find where to apply this hunk
        old_start = hunk["old_start"] - 1 + offset  # Convert to 0-indexed
        old_count = hunk["old_count"]

        # Get expected old lines from hunk
        expected_lines = [pl["content"] for pl in hunk["lines"] if pl["op"] in (" ", "-")]

        # Try exact match first
        actual_start = old_start
        matched = False

        # Check if expected lines match at the expected position
        if actual_start >= 0 and actual_start + len(expected_lines) <= len(content_lines):
            match = True
            for j, expected in enumerate(expected_lines):
                if content_lines[actual_start + j] != expected:
                    match = False
                    break
            if match:
                matched = True

        # Try fuzzy matching with offset
        if not matched:
            for fuzz in range(1, 10):
                for direction in [1, -1]:
                    test_start = old_start + fuzz * direction
                    if test_start >= 0 and test_start + len(expected_lines) <= len(content_lines):
                        match = True
                        for j, expected in enumerate(expected_lines):
                            if content_lines[test_start + j] != expected:
                                match = False
                                break
                        if match:
                            actual_start = test_start
                            matched = True
                            break
                if matched:
                    break

        if not matched:
            hunks_failed += 1
            errors.append(f"Hunk at line {hunk['old_start']} failed to apply")
            continue

        # Apply the hunk
        new_lines = []
        for pl in hunk["lines"]:
            if pl["op"] == " " or pl["op"] == "+":
                new_lines.append(pl["content"])

        # Replace old lines with new lines
        content_lines = (
            content_lines[:actual_start] +
            new_lines +
            content_lines[actual_start + len(expected_lines):]
        )

        # Update offset
        offset += len(new_lines) - len(expected_lines)
        hunks_applied += 1

    # Reconstruct content
    result_content = "\n".join(content_lines)
    if content_lines and (content.endswith("\n") or content == ""):
        result_content += "\n"

    success = hunks_failed == 0

    return {
        "content": result_content,
        "success": success,
        "hunks_applied": hunks_applied,
        "hunks_failed": hunks_failed,
        "errors": errors,
    }


def reverse_patch(patch: str) -> str:
    """Reverse a patch (swap additions and deletions).

    Args:
        patch: Unified diff format patch

    Returns:
        Reversed unified diff format patch
    """
    lines = patch.split("\n")
    result = []

    hunk_header_re = re.compile(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)")

    old_file = None
    new_file = None

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("--- "):
            # Store old file name, but don't output yet
            old_file = line[4:]
            i += 1
            continue
        elif line.startswith("+++ "):
            # Store new file name, now output both swapped
            new_file = line[4:]
            # Output --- with new file name and +++ with old file name
            result.append("--- " + new_file)
            result.append("+++ " + old_file)
            i += 1
            continue
        elif line.startswith("@@"):
            # Swap line counts in hunk header
            match = hunk_header_re.match(line)
            if match:
                old_start = match.group(1)
                old_count = match.group(2) if match.group(2) else "1"
                new_start = match.group(3)
                new_count = match.group(4) if match.group(4) else "1"
                suffix = match.group(5) if match.group(5) else ""
                result.append(f"@@ -{new_start},{new_count} +{old_start},{old_count} @@{suffix}")
            else:
                result.append(line)
        elif line.startswith("-"):
            # Change deletion to addition
            result.append("+" + line[1:])
        elif line.startswith("+"):
            # Change addition to deletion
            result.append("-" + line[1:])
        else:
            result.append(line)
        i += 1

    return "\n".join(result)
