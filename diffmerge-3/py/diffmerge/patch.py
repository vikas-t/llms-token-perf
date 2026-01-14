"""Patch creation and application for the diffmerge library."""

import re
from typing import Optional, Dict, Any, List, Tuple
from .types import (
    PatchHunk, PatchLine, ParsedPatch, ApplyResult, PatchOptions, ParseError
)
from .diff import _compute_lcs, _split_lines


def _create_unified_hunks(old_lines: List[str], new_lines: List[str],
                          context_lines: int = 3) -> List[PatchHunk]:
    """Create unified diff hunks from old and new lines."""
    lcs = _compute_lcs(old_lines, new_lines)

    # Build edit script: list of (op, old_idx, new_idx, content)
    edits = []
    old_idx = 0
    new_idx = 0
    lcs_idx = 0

    while old_idx < len(old_lines) or new_idx < len(new_lines):
        if lcs_idx < len(lcs):
            lcs_old, lcs_new = lcs[lcs_idx]

            # Deletions before LCS match
            while old_idx < lcs_old:
                edits.append(("-", old_idx, None, old_lines[old_idx]))
                old_idx += 1

            # Insertions before LCS match
            while new_idx < lcs_new:
                edits.append(("+", None, new_idx, new_lines[new_idx]))
                new_idx += 1

            # Equal line (LCS match)
            edits.append((" ", old_idx, new_idx, old_lines[old_idx]))
            old_idx += 1
            new_idx += 1
            lcs_idx += 1
        else:
            # Remaining deletions
            while old_idx < len(old_lines):
                edits.append(("-", old_idx, None, old_lines[old_idx]))
                old_idx += 1

            # Remaining insertions
            while new_idx < len(new_lines):
                edits.append(("+", None, new_idx, new_lines[new_idx]))
                new_idx += 1

    if not edits:
        return []

    # Find change regions and group into hunks with context
    hunks = []
    change_indices = [i for i, e in enumerate(edits) if e[0] != " "]

    if not change_indices:
        return []

    # Group changes into hunks
    hunk_groups = []
    current_group = [change_indices[0]]

    for i in range(1, len(change_indices)):
        prev_idx = change_indices[i - 1]
        curr_idx = change_indices[i]

        # If changes are close enough, include in same hunk
        if curr_idx - prev_idx <= 2 * context_lines + 1:
            current_group.append(curr_idx)
        else:
            hunk_groups.append(current_group)
            current_group = [curr_idx]

    hunk_groups.append(current_group)

    # Build hunks from groups
    for group in hunk_groups:
        first_change = group[0]
        last_change = group[-1]

        # Add context before and after
        start = max(0, first_change - context_lines)
        end = min(len(edits), last_change + context_lines + 1)

        # Calculate old/new line ranges
        old_start = None
        new_start = None
        old_count = 0
        new_count = 0
        lines = []

        for i in range(start, end):
            op, oi, ni, content = edits[i]

            if op == " ":
                if old_start is None:
                    old_start = oi + 1
                if new_start is None:
                    new_start = ni + 1
                old_count += 1
                new_count += 1
            elif op == "-":
                if old_start is None:
                    old_start = oi + 1
                old_count += 1
            elif op == "+":
                if new_start is None:
                    new_start = ni + 1
                new_count += 1

            lines.append(PatchLine(op=op, content=content))

        # Handle edge case where start is 0
        if old_start is None:
            old_start = 1
        if new_start is None:
            new_start = 1

        hunks.append(PatchHunk(
            old_start=old_start,
            old_count=old_count,
            new_start=new_start,
            new_count=new_count,
            lines=lines
        ))

    return hunks


def create_patch(old: str, new: str, options: Optional[Dict[str, Any]] = None) -> str:
    """Generate unified diff format patch.

    Args:
        old: Original content
        new: New content
        options: Optional dict with:
            - old_file: Name of old file
            - new_file: Name of new file
            - context_lines: Number of context lines

    Returns:
        Unified diff format string
    """
    opts = PatchOptions()
    if options:
        if "old_file" in options:
            opts.old_file = options["old_file"]
        if "new_file" in options:
            opts.new_file = options["new_file"]
        if "context_lines" in options:
            opts.context_lines = options["context_lines"]

    old_lines = _split_lines(old)
    new_lines = _split_lines(new)

    hunks = _create_unified_hunks(old_lines, new_lines, opts.context_lines)

    # Build unified diff output
    lines = []
    lines.append(f"--- {opts.old_file}")
    lines.append(f"+++ {opts.new_file}")

    for hunk in hunks:
        # Hunk header
        header = f"@@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@"
        lines.append(header)

        # Hunk lines
        for pl in hunk.lines:
            lines.append(f"{pl.op}{pl.content}")

    return "\n".join(lines) + ("\n" if lines else "")


def parse_patch(patch: str) -> dict:
    """Parse unified diff format into structured data.

    Args:
        patch: Unified diff format string

    Returns:
        Dict with old_file, new_file, and hunks

    Raises:
        ParseError: If patch format is invalid
    """
    lines = patch.split("\n")
    if not lines:
        raise ParseError("Empty patch")

    old_file = ""
    new_file = ""
    hunks = []
    current_hunk = None
    i = 0

    while i < len(lines):
        line = lines[i]

        if line.startswith("---"):
            # Old file header
            old_file = line[4:].strip()
        elif line.startswith("+++"):
            # New file header
            new_file = line[4:].strip()
        elif line.startswith("@@"):
            # Hunk header
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if not match:
                raise ParseError(f"Invalid hunk header: {line}")

            old_start = int(match.group(1))
            old_count = int(match.group(2)) if match.group(2) else 1
            new_start = int(match.group(3))
            new_count = int(match.group(4)) if match.group(4) else 1

            if current_hunk:
                hunks.append(current_hunk)

            current_hunk = PatchHunk(
                old_start=old_start,
                old_count=old_count,
                new_start=new_start,
                new_count=new_count,
                lines=[]
            )
        elif current_hunk is not None:
            if line.startswith(" "):
                current_hunk.lines.append(PatchLine(op=" ", content=line[1:]))
            elif line.startswith("+"):
                current_hunk.lines.append(PatchLine(op="+", content=line[1:]))
            elif line.startswith("-"):
                current_hunk.lines.append(PatchLine(op="-", content=line[1:]))
            elif line == "":
                # Empty line at end of patch
                pass
            else:
                # Treat as context line if no prefix and hunk is active
                pass

        i += 1

    if current_hunk:
        hunks.append(current_hunk)

    if not old_file and not new_file and not hunks:
        raise ParseError("Invalid patch format")

    result = ParsedPatch(old_file=old_file, new_file=new_file, hunks=hunks)
    return result.to_dict()


def _apply_hunk(lines: List[str], hunk: PatchHunk, offset: int) -> Tuple[bool, List[str], int]:
    """Apply a single hunk to lines.

    Returns (success, new_lines, new_offset)
    """
    # Calculate the position to apply (1-indexed to 0-indexed, plus offset)
    pos = hunk.old_start - 1 + offset

    # Verify context lines match
    expected_old = []
    for pl in hunk.lines:
        if pl.op in (" ", "-"):
            expected_old.append(pl.content)

    # Check if hunk applies at this position
    can_apply = True
    if pos < 0:
        can_apply = False
    elif pos + len(expected_old) > len(lines):
        # Try fuzzy matching
        can_apply = False

    if can_apply:
        # Verify lines match
        for i, expected in enumerate(expected_old):
            if pos + i >= len(lines):
                can_apply = False
                break
            if lines[pos + i] != expected:
                can_apply = False
                break

    if not can_apply:
        # Try fuzzy matching within a range
        for fuzz_offset in range(-3, 4):
            fuzz_pos = pos + fuzz_offset
            if fuzz_pos < 0 or fuzz_pos + len(expected_old) > len(lines):
                continue

            match = True
            for i, expected in enumerate(expected_old):
                if lines[fuzz_pos + i] != expected:
                    match = False
                    break

            if match:
                pos = fuzz_pos
                can_apply = True
                offset += fuzz_offset
                break

    if not can_apply:
        return False, lines, offset

    # Apply the hunk
    new_lines = lines[:pos]
    for pl in hunk.lines:
        if pl.op == " ":
            new_lines.append(pl.content)
        elif pl.op == "+":
            new_lines.append(pl.content)
        # Skip "-" lines (deletions)

    new_lines.extend(lines[pos + len(expected_old):])

    # Adjust offset for line count changes
    new_count = sum(1 for pl in hunk.lines if pl.op in (" ", "+"))
    offset += new_count - len(expected_old)

    return True, new_lines, offset


def apply_patch(content: str, patch: str) -> dict:
    """Apply a unified diff patch to content.

    Args:
        content: Original content
        patch: Unified diff patch

    Returns:
        Dict with content, success, hunks_applied, hunks_failed, errors
    """
    try:
        parsed = parse_patch(patch)
    except ParseError as e:
        return ApplyResult(
            content=content,
            success=False,
            hunks_applied=0,
            hunks_failed=1,
            errors=[str(e)]
        ).to_dict()

    if not parsed["hunks"]:
        return ApplyResult(
            content=content,
            success=True,
            hunks_applied=0,
            hunks_failed=0,
            errors=[]
        ).to_dict()

    lines = _split_lines(content)
    offset = 0
    hunks_applied = 0
    hunks_failed = 0
    errors = []

    for hunk_dict in parsed["hunks"]:
        hunk = PatchHunk(
            old_start=hunk_dict["old_start"],
            old_count=hunk_dict["old_count"],
            new_start=hunk_dict["new_start"],
            new_count=hunk_dict["new_count"],
            lines=[PatchLine(op=l["op"], content=l["content"]) for l in hunk_dict["lines"]]
        )

        success, lines, offset = _apply_hunk(lines, hunk, offset)
        if success:
            hunks_applied += 1
        else:
            hunks_failed += 1
            errors.append(f"Failed to apply hunk at line {hunk.old_start}")

    # Reconstruct content
    result_content = "\n".join(lines)
    if lines and content.endswith("\n"):
        result_content += "\n"

    return ApplyResult(
        content=result_content,
        success=hunks_failed == 0,
        hunks_applied=hunks_applied,
        hunks_failed=hunks_failed,
        errors=errors
    ).to_dict()


def reverse_patch(patch: str) -> str:
    """Reverse a patch (swap additions and deletions).

    Args:
        patch: Unified diff patch

    Returns:
        Reversed patch string
    """
    lines = patch.split("\n")
    result = []

    for line in lines:
        if line.startswith("---"):
            # Swap to +++
            result.append("+++" + line[3:])
        elif line.startswith("+++"):
            # Swap to ---
            result.append("---" + line[3:])
        elif line.startswith("@@"):
            # Swap old and new in hunk header
            match = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)", line)
            if match:
                old_start = match.group(1)
                old_count = match.group(2) if match.group(2) else "1"
                new_start = match.group(3)
                new_count = match.group(4) if match.group(4) else "1"
                rest = match.group(5) or ""
                result.append(f"@@ -{new_start},{new_count} +{old_start},{old_count} @@{rest}")
            else:
                result.append(line)
        elif line.startswith("+"):
            # Swap + to -
            result.append("-" + line[1:])
        elif line.startswith("-"):
            # Swap - to +
            result.append("+" + line[1:])
        else:
            result.append(line)

    # Fix the order: put --- before +++
    final = []
    i = 0
    while i < len(result):
        if result[i].startswith("+++") and i + 1 < len(result) and result[i + 1].startswith("---"):
            final.append(result[i + 1])
            final.append(result[i])
            i += 2
        else:
            final.append(result[i])
            i += 1

    return "\n".join(final)
