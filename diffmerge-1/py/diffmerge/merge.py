"""Merge functionality for the diffmerge library."""

import re
from typing import Optional, Dict, Any, List
from .types import MergeResult, Conflict, MergeOptions
from .diff import diff_lines
from .utils import split_lines


def merge3(base: str, ours: str, theirs: str,
           options: Optional[Dict[str, Any]] = None) -> MergeResult:
    """Three-way merge with conflict detection.

    Args:
        base: Base/common ancestor content
        ours: Our version of the content
        theirs: Their version of the content
        options: Optional dict with keys:
            - conflict_style: "diff3" | "merge" (default: "merge")
            - ours_label: Label for our changes (default: "ours")
            - theirs_label: Label for their changes (default: "theirs")
            - base_label: Label for base (default: "base", only used with diff3)

    Returns:
        MergeResult with merged content and conflict info
    """
    opts = options or {}
    conflict_style = opts.get("conflict_style", "merge")
    ours_label = opts.get("ours_label", "ours")
    theirs_label = opts.get("theirs_label", "theirs")
    base_label = opts.get("base_label", "base")

    # Handle edge cases
    if base == ours == theirs:
        return {
            "content": base,
            "has_conflicts": False,
            "conflicts": [],
        }

    if base == ours:
        return {
            "content": theirs,
            "has_conflicts": False,
            "conflicts": [],
        }

    if base == theirs:
        return {
            "content": ours,
            "has_conflicts": False,
            "conflicts": [],
        }

    if ours == theirs:
        return {
            "content": ours,
            "has_conflicts": False,
            "conflicts": [],
        }

    # Compute diffs
    base_lines = split_lines(base) if base else []
    ours_lines = split_lines(ours) if ours else []
    theirs_lines = split_lines(theirs) if theirs else []

    # Use LCS to align base with ours and theirs
    diff_ours = diff_lines(base, ours)
    diff_theirs = diff_lines(base, theirs)

    # Build maps of base line changes
    # For each base line, track what ours and theirs did to it
    ours_changes: Dict[int, Dict[str, Any]] = {}  # base_line -> change info
    theirs_changes: Dict[int, Dict[str, Any]] = {}

    # Process ours diff
    base_idx = 0
    ours_idx = 0
    for h in diff_ours["hunks"]:
        if h["op"] == "equal":
            ours_changes[base_idx] = {"op": "keep", "content": h["content"]}
            base_idx += 1
            ours_idx += 1
        elif h["op"] == "delete":
            ours_changes[base_idx] = {"op": "delete", "content": h["content"]}
            base_idx += 1
        else:  # insert
            # Insertion after current base position
            if base_idx not in ours_changes:
                ours_changes[base_idx] = {"op": "insert_before", "content": [h["content"]]}
            elif ours_changes[base_idx].get("op") == "insert_before":
                ours_changes[base_idx]["content"].append(h["content"])
            else:
                # Already has a different op, add insertion after
                if "insert_after" not in ours_changes[base_idx]:
                    ours_changes[base_idx]["insert_after"] = []
                ours_changes[base_idx]["insert_after"].append(h["content"])
            ours_idx += 1

    # Process theirs diff
    base_idx = 0
    theirs_idx = 0
    for h in diff_theirs["hunks"]:
        if h["op"] == "equal":
            theirs_changes[base_idx] = {"op": "keep", "content": h["content"]}
            base_idx += 1
            theirs_idx += 1
        elif h["op"] == "delete":
            theirs_changes[base_idx] = {"op": "delete", "content": h["content"]}
            base_idx += 1
        else:  # insert
            if base_idx not in theirs_changes:
                theirs_changes[base_idx] = {"op": "insert_before", "content": [h["content"]]}
            elif theirs_changes[base_idx].get("op") == "insert_before":
                theirs_changes[base_idx]["content"].append(h["content"])
            else:
                if "insert_after" not in theirs_changes[base_idx]:
                    theirs_changes[base_idx]["insert_after"] = []
                theirs_changes[base_idx]["insert_after"].append(h["content"])
            theirs_idx += 1

    # Perform three-way merge
    result_lines: List[str] = []
    conflicts: List[Conflict] = []
    current_line = 1  # Track output line number

    max_base = max(len(base_lines), max(ours_changes.keys(), default=0) + 1, max(theirs_changes.keys(), default=0) + 1)

    i = 0
    while i < max_base:
        ours_op = ours_changes.get(i, {"op": "keep", "content": base_lines[i] if i < len(base_lines) else ""})
        theirs_op = theirs_changes.get(i, {"op": "keep", "content": base_lines[i] if i < len(base_lines) else ""})

        # Handle insertions before this position
        ours_insert = ours_op.get("content", []) if ours_op.get("op") == "insert_before" else []
        theirs_insert = theirs_op.get("content", []) if theirs_op.get("op") == "insert_before" else []

        if isinstance(ours_insert, list) and isinstance(theirs_insert, list):
            if ours_insert and theirs_insert:
                if ours_insert == theirs_insert:
                    # Same insertions
                    for line in ours_insert:
                        result_lines.append(line)
                        current_line += 1
                else:
                    # Different insertions - conflict
                    pass  # Will be handled below with the base line
            elif ours_insert:
                for line in ours_insert:
                    result_lines.append(line)
                    current_line += 1
            elif theirs_insert:
                for line in theirs_insert:
                    result_lines.append(line)
                    current_line += 1

        # Handle the base line itself
        if i >= len(base_lines):
            i += 1
            continue

        base_line = base_lines[i] if i < len(base_lines) else ""

        ours_real_op = ours_changes.get(i, {"op": "keep", "content": base_line})
        theirs_real_op = theirs_changes.get(i, {"op": "keep", "content": base_line})

        if ours_real_op.get("op") == "insert_before":
            ours_real_op = {"op": "keep", "content": base_line}
        if theirs_real_op.get("op") == "insert_before":
            theirs_real_op = {"op": "keep", "content": base_line}

        ours_op_type = ours_real_op.get("op", "keep")
        theirs_op_type = theirs_real_op.get("op", "keep")

        if ours_op_type == "keep" and theirs_op_type == "keep":
            # Both kept the line
            result_lines.append(base_line)
            current_line += 1
        elif ours_op_type == "keep" and theirs_op_type == "delete":
            # Theirs deleted, ours kept - take deletion
            pass  # Line is deleted
        elif ours_op_type == "delete" and theirs_op_type == "keep":
            # Ours deleted, theirs kept - take deletion
            pass  # Line is deleted
        elif ours_op_type == "delete" and theirs_op_type == "delete":
            # Both deleted - agree on deletion
            pass
        else:
            # Some form of conflict
            pass

        # Check for conflicting modifications
        # A conflict occurs when both sides modified the same region differently

        i += 1

    # Actually, let's do a simpler approach: reconstruct from diffs directly

    # Reset and use a different algorithm
    result_lines = []
    conflicts = []

    # Create aligned sequences
    def align_sequences(base_lines, ours_lines, theirs_lines):
        """Align three sequences and detect conflicts."""
        # Use diff results to understand changes
        ours_diff = diff_lines(base if base else "", ours if ours else "")
        theirs_diff = diff_lines(base if base else "", theirs if theirs else "")

        # Build a merged view
        merged = []
        conflict_list = []

        # Get change maps: for each base line index, what did ours/theirs do?
        # 'keep' = unchanged, 'delete' = removed
        # Also track insertions that follow deletions (which means "modify")

        def get_change_map(diff_result, base_lines):
            """Map base line indices to operations."""
            changes = {}  # base_idx -> (op, content, replacement_lines)
            base_idx = 0
            pending_inserts = []  # Insertions waiting to be attached

            # Process hunks to group consecutive delete+insert as modifications
            hunks = diff_result["hunks"]
            i = 0
            while i < len(hunks):
                h = hunks[i]
                if h["op"] == "equal":
                    # First, attach any pending inserts to previous position
                    if pending_inserts:
                        if base_idx > 0 and base_idx - 1 in changes:
                            prev = changes[base_idx - 1]
                            if prev[0] == "delete":
                                # This is actually a modification (delete + insert)
                                changes[base_idx - 1] = ("modify", prev[1], pending_inserts)
                            else:
                                # Insert after keep
                                changes[base_idx - 1] = (prev[0], prev[1], prev[2] if len(prev) > 2 else [], pending_inserts)
                        else:
                            # Insert at beginning
                            if "insert_at_start" not in changes:
                                changes["insert_at_start"] = pending_inserts
                            else:
                                changes["insert_at_start"].extend(pending_inserts)
                        pending_inserts = []

                    changes[base_idx] = ("keep", h["content"], [])
                    base_idx += 1
                    i += 1
                elif h["op"] == "delete":
                    # Check if there are pending inserts - if so, this is a modification
                    if pending_inserts:
                        # Inserts came before this delete -> modification
                        changes[base_idx] = ("modify", h["content"], pending_inserts)
                        pending_inserts = []
                        base_idx += 1
                        i += 1
                    else:
                        # No pending inserts - check for inserts after this delete
                        # Collect all consecutive deletes and inserts
                        deletes = [h]
                        j = i + 1
                        while j < len(hunks) and hunks[j]["op"] == "delete":
                            deletes.append(hunks[j])
                            j += 1

                        # Check for following inserts
                        inserts = []
                        while j < len(hunks) and hunks[j]["op"] == "insert":
                            inserts.append(hunks[j])
                            j += 1

                        if inserts:
                            # This is a modification block
                            for k, d in enumerate(deletes):
                                if k < len(inserts):
                                    changes[base_idx] = ("modify", d["content"], [inserts[k]["content"]])
                                else:
                                    changes[base_idx] = ("delete", d["content"], [])
                                base_idx += 1

                            # Any extra inserts go as trailing inserts on last delete
                            if len(inserts) > len(deletes):
                                extra = [ins["content"] for ins in inserts[len(deletes):]]
                                pending_inserts = extra
                        else:
                            # Pure deletes
                            for d in deletes:
                                changes[base_idx] = ("delete", d["content"], [])
                                base_idx += 1

                        i = j
                elif h["op"] == "insert":
                    pending_inserts.append(h["content"])
                    i += 1

            # Handle trailing inserts
            if pending_inserts:
                if base_idx > 0 and base_idx - 1 in changes:
                    prev = changes[base_idx - 1]
                    if prev[0] == "delete":
                        changes[base_idx - 1] = ("modify", prev[1], pending_inserts)
                    else:
                        if len(prev) > 2:
                            changes[base_idx - 1] = (prev[0], prev[1], prev[2], pending_inserts)
                        else:
                            changes[base_idx - 1] = (prev[0], prev[1], [], pending_inserts)
                else:
                    changes["insert_at_end"] = pending_inserts

            return changes

        ours_map = get_change_map(ours_diff, base_lines)
        theirs_map = get_change_map(theirs_diff, base_lines)

        output = []
        conflicts = []
        line_num = 1

        # Handle insertions at start
        ours_start = ours_map.get("insert_at_start", [])
        theirs_start = theirs_map.get("insert_at_start", [])

        if ours_start and theirs_start:
            if ours_start == theirs_start:
                output.extend(ours_start)
                line_num += len(ours_start)
            else:
                # Conflict
                start = line_num
                output.append(f"<<<<<<< {ours_label}\n")
                output.extend(ours_start)
                if conflict_style == "diff3":
                    output.append(f"||||||| {base_label}\n")
                output.append("=======\n")
                output.extend(theirs_start)
                output.append(f">>>>>>> {theirs_label}\n")
                conflicts.append({
                    "base": "",
                    "ours": "".join(ours_start),
                    "theirs": "".join(theirs_start),
                    "start_line": start,
                    "end_line": line_num + len(ours_start) + len(theirs_start) + 3,
                })
                line_num += len(ours_start) + len(theirs_start) + 4
        elif ours_start:
            output.extend(ours_start)
            line_num += len(ours_start)
        elif theirs_start:
            output.extend(theirs_start)
            line_num += len(theirs_start)

        for i in range(len(base_lines)):
            ours_op = ours_map.get(i, ("keep", base_lines[i], []))
            theirs_op = theirs_map.get(i, ("keep", base_lines[i], []))

            ours_type = ours_op[0]
            theirs_type = theirs_op[0]

            # Get replacements (for modify operations)
            ours_repl = ours_op[2] if len(ours_op) > 2 else []
            theirs_repl = theirs_op[2] if len(theirs_op) > 2 else []

            # Get trailing inserts
            ours_trail_ins = ours_op[3] if len(ours_op) > 3 else []
            theirs_trail_ins = theirs_op[3] if len(theirs_op) > 3 else []

            # Determine if there's a conflict
            is_conflict = False

            if ours_type == "keep" and theirs_type == "keep":
                # Both kept - no conflict
                output.append(base_lines[i])
                line_num += 1
            elif ours_type == "keep" and theirs_type == "delete":
                # Theirs deleted - take deletion
                pass
            elif ours_type == "delete" and theirs_type == "keep":
                # Ours deleted - take deletion
                pass
            elif ours_type == "delete" and theirs_type == "delete":
                # Both deleted - no conflict
                pass
            elif ours_type == "modify" and theirs_type == "modify":
                # Both modified
                if ours_repl == theirs_repl:
                    # Same modification - no conflict
                    output.extend(ours_repl)
                    line_num += len(ours_repl)
                else:
                    # Different modifications - conflict
                    is_conflict = True
            elif ours_type == "modify" and theirs_type == "keep":
                # Ours modified, theirs kept - take modification
                output.extend(ours_repl)
                line_num += len(ours_repl)
            elif ours_type == "keep" and theirs_type == "modify":
                # Theirs modified, ours kept - take modification
                output.extend(theirs_repl)
                line_num += len(theirs_repl)
            elif ours_type == "modify" and theirs_type == "delete":
                # Ours modified, theirs deleted - conflict
                is_conflict = True
            elif ours_type == "delete" and theirs_type == "modify":
                # Ours deleted, theirs modified - conflict
                is_conflict = True
            else:
                # Unknown combination - treat as conflict
                is_conflict = True

            if is_conflict:
                start = line_num
                output.append(f"<<<<<<< {ours_label}\n")
                if ours_type == "modify":
                    output.extend(ours_repl)
                elif ours_type == "keep":
                    output.append(ours_op[1])
                # delete means nothing to add

                if conflict_style == "diff3":
                    output.append(f"||||||| {base_label}\n")
                    output.append(base_lines[i])

                output.append("=======\n")

                if theirs_type == "modify":
                    output.extend(theirs_repl)
                elif theirs_type == "keep":
                    output.append(theirs_op[1])
                # delete means nothing to add

                output.append(f">>>>>>> {theirs_label}\n")

                ours_content = "".join(ours_repl) if ours_type == "modify" else (ours_op[1] if ours_type == "keep" else "")
                theirs_content = "".join(theirs_repl) if theirs_type == "modify" else (theirs_op[1] if theirs_type == "keep" else "")

                conflicts.append({
                    "base": base_lines[i],
                    "ours": ours_content,
                    "theirs": theirs_content,
                    "start_line": start,
                    "end_line": line_num + 4,
                })
                line_num += 4 + (1 if conflict_style == "diff3" else 0)

            # Handle trailing insertions after this base line
            if ours_trail_ins and theirs_trail_ins:
                if ours_trail_ins == theirs_trail_ins:
                    output.extend(ours_trail_ins)
                    line_num += len(ours_trail_ins)
                else:
                    # Conflict
                    start = line_num
                    output.append(f"<<<<<<< {ours_label}\n")
                    output.extend(ours_trail_ins)
                    if conflict_style == "diff3":
                        output.append(f"||||||| {base_label}\n")
                    output.append("=======\n")
                    output.extend(theirs_trail_ins)
                    output.append(f">>>>>>> {theirs_label}\n")
                    conflicts.append({
                        "base": "",
                        "ours": "".join(ours_trail_ins),
                        "theirs": "".join(theirs_trail_ins),
                        "start_line": start,
                        "end_line": line_num + len(ours_trail_ins) + len(theirs_trail_ins) + 3,
                    })
                    line_num += len(ours_trail_ins) + len(theirs_trail_ins) + 4
            elif ours_trail_ins:
                output.extend(ours_trail_ins)
                line_num += len(ours_trail_ins)
            elif theirs_trail_ins:
                output.extend(theirs_trail_ins)
                line_num += len(theirs_trail_ins)

        # Handle insertions at end
        ours_end = ours_map.get("insert_at_end", [])
        theirs_end = theirs_map.get("insert_at_end", [])

        if ours_end and theirs_end:
            if ours_end == theirs_end:
                output.extend(ours_end)
            else:
                start = line_num
                output.append(f"<<<<<<< {ours_label}\n")
                output.extend(ours_end)
                if conflict_style == "diff3":
                    output.append(f"||||||| {base_label}\n")
                output.append("=======\n")
                output.extend(theirs_end)
                output.append(f">>>>>>> {theirs_label}\n")
                conflicts.append({
                    "base": "",
                    "ours": "".join(ours_end),
                    "theirs": "".join(theirs_end),
                    "start_line": start,
                    "end_line": line_num + len(ours_end) + len(theirs_end) + 3,
                })
        elif ours_end:
            output.extend(ours_end)
        elif theirs_end:
            output.extend(theirs_end)

        return output, conflicts

    merged_lines, conflicts = align_sequences(base_lines, ours_lines, theirs_lines)

    result_content = "".join(merged_lines)

    return {
        "content": result_content,
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts,
    }


def has_conflicts(content: str) -> bool:
    """Check if content contains conflict markers.

    Args:
        content: Content to check

    Returns:
        True if conflict markers are found
    """
    # Look for the full conflict pattern
    return bool(re.search(r"^<<<<<<<.*\n[\s\S]*?^=======\n[\s\S]*?^>>>>>>>", content, re.MULTILINE))


def extract_conflicts(content: str) -> List[Conflict]:
    """Extract conflict regions from merged content.

    Args:
        content: Content with conflict markers

    Returns:
        List of Conflict objects
    """
    conflicts = []
    lines = content.split("\n")

    i = 0
    while i < len(lines):
        if lines[i].startswith("<<<<<<<"):
            ours_label = lines[i][7:].strip()
            start_line = i + 1

            # Find ours content
            ours_lines = []
            base_lines = []
            theirs_lines = []
            i += 1

            # Look for base marker (diff3 style) or separator
            while i < len(lines) and not lines[i].startswith("|||||||") and not lines[i].startswith("======="):
                ours_lines.append(lines[i])
                i += 1

            # Check for diff3 style base
            if i < len(lines) and lines[i].startswith("|||||||"):
                i += 1
                while i < len(lines) and not lines[i].startswith("======="):
                    base_lines.append(lines[i])
                    i += 1

            # Skip separator
            if i < len(lines) and lines[i].startswith("======="):
                i += 1

            # Find theirs content
            while i < len(lines) and not lines[i].startswith(">>>>>>>"):
                theirs_lines.append(lines[i])
                i += 1

            end_line = i + 1

            conflicts.append({
                "base": "\n".join(base_lines) + ("\n" if base_lines else ""),
                "ours": "\n".join(ours_lines) + ("\n" if ours_lines else ""),
                "theirs": "\n".join(theirs_lines) + ("\n" if theirs_lines else ""),
                "start_line": start_line,
                "end_line": end_line,
            })
        i += 1

    return conflicts


def resolve_conflict(content: str, conflict_index: int,
                    resolution: str) -> str:
    """Resolve a specific conflict in the content.

    Args:
        content: Content with conflict markers
        conflict_index: Index of conflict to resolve (0-indexed)
        resolution: "ours", "theirs", "base", or custom text

    Returns:
        Content with the specified conflict resolved
    """
    conflicts = extract_conflicts(content)
    if conflict_index >= len(conflicts):
        return content

    conflict = conflicts[conflict_index]

    # Determine replacement text
    if resolution == "ours":
        replacement = conflict["ours"]
    elif resolution == "theirs":
        replacement = conflict["theirs"]
    elif resolution == "base":
        replacement = conflict["base"]
    else:
        replacement = resolution

    # Find and replace the conflict markers
    lines = content.split("\n")
    result_lines = []

    conflicts_found = 0
    i = 0

    while i < len(lines):
        if lines[i].startswith("<<<<<<<"):
            if conflicts_found == conflict_index:
                # Skip the conflict markers and insert replacement
                # Find the end of this conflict
                while i < len(lines) and not lines[i].startswith(">>>>>>>"):
                    i += 1
                i += 1  # Skip the >>>>>>> line

                # Add replacement (without trailing newline since join adds them)
                if replacement:
                    rep_lines = replacement.rstrip("\n").split("\n")
                    result_lines.extend(rep_lines)

                conflicts_found += 1
                continue
            else:
                conflicts_found += 1

        result_lines.append(lines[i])
        i += 1

    return "\n".join(result_lines) + ("\n" if content.endswith("\n") else "")
