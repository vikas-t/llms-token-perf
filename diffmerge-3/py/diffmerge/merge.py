"""Three-way merge functionality for the diffmerge library."""

import re
from typing import Optional, Dict, Any, List, Tuple
from .types import MergeResult, Conflict, MergeOptions
from .diff import _compute_lcs, _split_lines


def _diff3_merge(base_lines: List[str], ours_lines: List[str],
                 theirs_lines: List[str]) -> List[Tuple[str, List[str], List[str], List[str]]]:
    """Perform diff3 merge algorithm.

    Returns list of (type, base, ours, theirs) regions where type is:
    - "equal": All three match
    - "ours": Only ours changed
    - "theirs": Only theirs changed
    - "both_same": Both changed identically
    - "conflict": Both changed differently
    """
    # Handle empty cases
    if not base_lines and not ours_lines and not theirs_lines:
        return []

    if not base_lines:
        # Empty base - both added content
        if ours_lines == theirs_lines:
            return [("both_same", [], ours_lines, theirs_lines)]
        else:
            return [("conflict", [], ours_lines, theirs_lines)]

    # Compute diffs from base to ours and base to theirs
    lcs_ours = _compute_lcs(base_lines, ours_lines)
    lcs_theirs = _compute_lcs(base_lines, theirs_lines)

    # Build mappings from base indices to ours/theirs indices
    base_to_ours = {bi: oi for bi, oi in lcs_ours}
    base_to_theirs = {bi: ti for bi, ti in lcs_theirs}
    ours_to_base = {oi: bi for bi, oi in lcs_ours}
    theirs_to_base = {ti: bi for bi, ti in lcs_theirs}

    # Track which base lines are matched
    base_matched_ours = set(base_to_ours.keys())
    base_matched_theirs = set(base_to_theirs.keys())

    # Process line by line using the three-way merge algorithm
    regions = []
    base_idx = 0
    ours_idx = 0
    theirs_idx = 0

    while base_idx < len(base_lines) or ours_idx < len(ours_lines) or theirs_idx < len(theirs_lines):
        # Check if all three are at a sync point
        base_in_ours = base_idx in base_to_ours and base_to_ours[base_idx] == ours_idx
        base_in_theirs = base_idx in base_to_theirs and base_to_theirs[base_idx] == theirs_idx

        if base_idx < len(base_lines) and base_in_ours and base_in_theirs:
            # All three match - this line is unchanged
            regions.append(("equal", [base_lines[base_idx]], [ours_lines[ours_idx]], [theirs_lines[theirs_idx]]))
            base_idx += 1
            ours_idx += 1
            theirs_idx += 1
            continue

        # Find the next sync point
        # A sync point is where all three indices can align on matching content
        next_sync_base = None
        next_sync_ours = None
        next_sync_theirs = None

        # Search for the next base line that matches in both ours and theirs
        for b in range(base_idx, len(base_lines)):
            if b in base_to_ours and b in base_to_theirs:
                o = base_to_ours[b]
                t = base_to_theirs[b]
                if o >= ours_idx and t >= theirs_idx:
                    next_sync_base = b
                    next_sync_ours = o
                    next_sync_theirs = t
                    break

        # Extract chunks between current position and next sync
        if next_sync_base is not None:
            base_chunk = base_lines[base_idx:next_sync_base]
            ours_chunk = ours_lines[ours_idx:next_sync_ours]
            theirs_chunk = theirs_lines[theirs_idx:next_sync_theirs]
        else:
            # No more sync points - take everything remaining
            base_chunk = base_lines[base_idx:]
            ours_chunk = ours_lines[ours_idx:]
            theirs_chunk = theirs_lines[theirs_idx:]

        # Determine change type for this region
        if base_chunk or ours_chunk or theirs_chunk:
            base_changed_ours = base_chunk != ours_chunk
            base_changed_theirs = base_chunk != theirs_chunk

            if not base_changed_ours and not base_changed_theirs:
                region_type = "equal"
            elif base_changed_ours and not base_changed_theirs:
                region_type = "ours"
            elif not base_changed_ours and base_changed_theirs:
                region_type = "theirs"
            elif ours_chunk == theirs_chunk:
                region_type = "both_same"
            else:
                # Check if we can do a finer-grained merge
                # Try to merge the chunks line by line
                merged_lines, has_conflict = _merge_chunks(base_chunk, ours_chunk, theirs_chunk)
                if has_conflict:
                    region_type = "conflict"
                else:
                    # Successfully merged without conflict
                    regions.append(("merged", base_chunk, merged_lines, merged_lines))
                    if next_sync_base is not None:
                        base_idx = next_sync_base
                        ours_idx = next_sync_ours
                        theirs_idx = next_sync_theirs
                    else:
                        base_idx = len(base_lines)
                        ours_idx = len(ours_lines)
                        theirs_idx = len(theirs_lines)
                    continue

            regions.append((region_type, base_chunk, ours_chunk, theirs_chunk))

        # Move to next sync point
        if next_sync_base is not None:
            base_idx = next_sync_base
            ours_idx = next_sync_ours
            theirs_idx = next_sync_theirs
        else:
            break

    return regions


def _merge_chunks(base_chunk: List[str], ours_chunk: List[str],
                  theirs_chunk: List[str]) -> Tuple[List[str], bool]:
    """Try to merge two changed chunks against a base.

    Returns (merged_lines, has_conflict).
    """
    # Use LCS to align the chunks
    lcs_ours = _compute_lcs(base_chunk, ours_chunk)
    lcs_theirs = _compute_lcs(base_chunk, theirs_chunk)

    base_to_ours = {bi: oi for bi, oi in lcs_ours}
    base_to_theirs = {bi: ti for bi, ti in lcs_theirs}

    result = []
    base_idx = 0
    ours_idx = 0
    theirs_idx = 0

    while base_idx < len(base_chunk) or ours_idx < len(ours_chunk) or theirs_idx < len(theirs_chunk):
        base_in_ours = base_idx in base_to_ours and base_to_ours[base_idx] == ours_idx
        base_in_theirs = base_idx in base_to_theirs and base_to_theirs[base_idx] == theirs_idx

        if base_idx < len(base_chunk) and base_in_ours and base_in_theirs:
            # All three match
            result.append(base_chunk[base_idx])
            base_idx += 1
            ours_idx += 1
            theirs_idx += 1
        elif base_idx < len(base_chunk) and base_in_ours and not base_in_theirs:
            # Base matches ours but not theirs - take theirs' change
            # Find what theirs did with this line
            if theirs_idx < len(theirs_chunk):
                # Check if theirs deleted the line or changed it
                if base_idx in base_to_theirs:
                    # Line exists somewhere in theirs
                    result.append(base_chunk[base_idx])
                    base_idx += 1
                    ours_idx += 1
                else:
                    # Line was deleted/changed by theirs
                    if theirs_idx < len(theirs_chunk) and theirs_chunk[theirs_idx] not in base_chunk:
                        result.append(theirs_chunk[theirs_idx])
                        theirs_idx += 1
                    base_idx += 1
                    ours_idx += 1
            else:
                # Theirs deleted - skip
                base_idx += 1
                ours_idx += 1
        elif base_idx < len(base_chunk) and base_in_theirs and not base_in_ours:
            # Base matches theirs but not ours - take ours' change
            if ours_idx < len(ours_chunk):
                if base_idx in base_to_ours:
                    result.append(base_chunk[base_idx])
                    base_idx += 1
                    theirs_idx += 1
                else:
                    if ours_idx < len(ours_chunk) and ours_chunk[ours_idx] not in base_chunk:
                        result.append(ours_chunk[ours_idx])
                        ours_idx += 1
                    base_idx += 1
                    theirs_idx += 1
            else:
                base_idx += 1
                theirs_idx += 1
        else:
            # Neither side matches base - potential conflict
            # Check if both made the same change
            if (ours_idx < len(ours_chunk) and theirs_idx < len(theirs_chunk) and
                ours_chunk[ours_idx] == theirs_chunk[theirs_idx]):
                result.append(ours_chunk[ours_idx])
                ours_idx += 1
                theirs_idx += 1
                if base_idx < len(base_chunk) and base_idx not in base_to_ours and base_idx not in base_to_theirs:
                    base_idx += 1
            else:
                # Check if one side has additions
                if (ours_idx < len(ours_chunk) and
                    (base_idx >= len(base_chunk) or base_idx not in base_to_ours)):
                    # Ours has an insertion
                    if theirs_idx >= len(theirs_chunk) or (base_idx in base_to_theirs and base_to_theirs[base_idx] == theirs_idx):
                        result.append(ours_chunk[ours_idx])
                        ours_idx += 1
                        continue
                if (theirs_idx < len(theirs_chunk) and
                    (base_idx >= len(base_chunk) or base_idx not in base_to_theirs)):
                    # Theirs has an insertion
                    if ours_idx >= len(ours_chunk) or (base_idx in base_to_ours and base_to_ours[base_idx] == ours_idx):
                        result.append(theirs_chunk[theirs_idx])
                        theirs_idx += 1
                        continue

                # Real conflict
                return [], True

    return result, False


def merge3(base: str, ours: str, theirs: str,
           options: Optional[Dict[str, Any]] = None) -> dict:
    """Perform three-way merge with conflict detection.

    Args:
        base: Base/ancestor content
        ours: Our version
        theirs: Their version
        options: Optional dict with:
            - conflict_style: "merge" or "diff3"
            - ours_label: Label for our changes
            - theirs_label: Label for their changes
            - base_label: Label for base (diff3 only)

    Returns:
        Dict with content, has_conflicts, and conflicts
    """
    opts = MergeOptions()
    if options:
        if "conflict_style" in options:
            opts.conflict_style = options["conflict_style"]
        if "ours_label" in options:
            opts.ours_label = options["ours_label"]
        if "theirs_label" in options:
            opts.theirs_label = options["theirs_label"]
        if "base_label" in options:
            opts.base_label = options["base_label"]

    base_lines = _split_lines(base)
    ours_lines = _split_lines(ours)
    theirs_lines = _split_lines(theirs)

    regions = _diff3_merge(base_lines, ours_lines, theirs_lines)

    result_lines = []
    conflicts = []
    current_line = 1

    for region in regions:
        region_type = region[0]
        base_chunk = region[1]
        ours_chunk = region[2]
        theirs_chunk = region[3]

        if region_type == "equal":
            result_lines.extend(ours_chunk)
            current_line += len(ours_chunk)
        elif region_type == "ours":
            result_lines.extend(ours_chunk)
            current_line += len(ours_chunk)
        elif region_type == "theirs":
            result_lines.extend(theirs_chunk)
            current_line += len(theirs_chunk)
        elif region_type == "both_same":
            result_lines.extend(ours_chunk)
            current_line += len(ours_chunk)
        elif region_type == "merged":
            result_lines.extend(ours_chunk)  # ours_chunk contains merged lines
            current_line += len(ours_chunk)
        else:  # conflict
            start_line = current_line

            # Add conflict markers
            result_lines.append(f"<<<<<<< {opts.ours_label}")
            result_lines.extend(ours_chunk)

            if opts.conflict_style == "diff3":
                result_lines.append(f"||||||| {opts.base_label}")
                result_lines.extend(base_chunk)

            result_lines.append("=======")
            result_lines.extend(theirs_chunk)
            result_lines.append(f">>>>>>> {opts.theirs_label}")

            # Calculate end line
            marker_lines = 3 if opts.conflict_style == "merge" else 5
            end_line = start_line + marker_lines + len(ours_chunk) + len(theirs_chunk)
            if opts.conflict_style == "diff3":
                end_line += len(base_chunk)

            conflicts.append(Conflict(
                base="\n".join(base_chunk),
                ours="\n".join(ours_chunk),
                theirs="\n".join(theirs_chunk),
                start_line=start_line,
                end_line=end_line
            ))

            current_line = end_line

    # Reconstruct content
    content = "\n".join(result_lines)
    if result_lines and (base.endswith("\n") or ours.endswith("\n") or theirs.endswith("\n")):
        content += "\n"

    return MergeResult(
        content=content,
        has_conflicts=len(conflicts) > 0,
        conflicts=conflicts
    ).to_dict()


def has_conflicts(content: str) -> bool:
    """Check if content contains conflict markers.

    Args:
        content: Content to check

    Returns:
        True if conflict markers are present
    """
    # Look for the full conflict pattern
    has_start = bool(re.search(r'^<<<<<<<', content, re.MULTILINE))
    has_sep = bool(re.search(r'^=======', content, re.MULTILINE))
    has_end = bool(re.search(r'^>>>>>>>', content, re.MULTILINE))

    return has_start and has_sep and has_end


def extract_conflicts(content: str) -> List[dict]:
    """Extract conflict regions from merged content.

    Args:
        content: Merged content with conflict markers

    Returns:
        List of conflict dicts with ours, theirs, base, start_line, end_line
    """
    conflicts = []
    lines = content.split("\n")

    i = 0
    while i < len(lines):
        line = lines[i]

        if line.startswith("<<<<<<<"):
            start_line = i + 1
            ours_lines = []
            base_lines = []
            theirs_lines = []

            i += 1
            section = "ours"

            while i < len(lines):
                line = lines[i]

                if line.startswith("|||||||"):
                    section = "base"
                elif line.startswith("======="):
                    section = "theirs"
                elif line.startswith(">>>>>>>"):
                    end_line = i + 1
                    conflicts.append(Conflict(
                        base="\n".join(base_lines),
                        ours="\n".join(ours_lines),
                        theirs="\n".join(theirs_lines),
                        start_line=start_line,
                        end_line=end_line
                    ).to_dict())
                    break
                else:
                    if section == "ours":
                        ours_lines.append(line)
                    elif section == "base":
                        base_lines.append(line)
                    elif section == "theirs":
                        theirs_lines.append(line)

                i += 1

        i += 1

    return conflicts


def resolve_conflict(content: str, conflict_index: int, resolution: str) -> str:
    """Resolve a specific conflict in the content.

    Args:
        content: Content with conflict markers
        conflict_index: Index of the conflict to resolve (0-based)
        resolution: "ours", "theirs", "base", or custom text

    Returns:
        Content with the specified conflict resolved
    """
    lines = content.split("\n")
    result_lines = []

    conflict_count = 0
    i = 0

    while i < len(lines):
        line = lines[i]

        if line.startswith("<<<<<<<"):
            if conflict_count == conflict_index:
                # This is the conflict to resolve
                ours_lines = []
                base_lines = []
                theirs_lines = []

                i += 1
                section = "ours"

                while i < len(lines):
                    line = lines[i]

                    if line.startswith("|||||||"):
                        section = "base"
                    elif line.startswith("======="):
                        section = "theirs"
                    elif line.startswith(">>>>>>>"):
                        # Apply resolution
                        if resolution == "ours":
                            result_lines.extend(ours_lines)
                        elif resolution == "theirs":
                            result_lines.extend(theirs_lines)
                        elif resolution == "base":
                            result_lines.extend(base_lines)
                        else:
                            # Custom resolution - add as single line(s)
                            custom = resolution.rstrip("\n")
                            if custom:
                                result_lines.extend(custom.split("\n"))
                        break
                    else:
                        if section == "ours":
                            ours_lines.append(line)
                        elif section == "base":
                            base_lines.append(line)
                        elif section == "theirs":
                            theirs_lines.append(line)

                    i += 1

                conflict_count += 1
            else:
                # Not the conflict to resolve, keep as is
                result_lines.append(line)
                conflict_count += 1
        else:
            result_lines.append(line)

        i += 1

    return "\n".join(result_lines)
