"""Three-way merge functionality for diffmerge library."""

import re
from typing import List, Optional, Tuple
from .types import MergeResult, MergeOptions, Conflict
from .utils import split_lines


def _lcs_indices(a: List[str], b: List[str]) -> List[Tuple[int, int]]:
    """Compute LCS and return list of (index_in_a, index_in_b) pairs."""
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

    # Backtrack
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


def merge3(
    base: str,
    ours: str,
    theirs: str,
    options: Optional[MergeOptions] = None
) -> MergeResult:
    """Three-way merge with conflict detection."""
    opts = options or {}
    conflict_style = opts.get("conflict_style", "merge")
    ours_label = opts.get("ours_label", "ours")
    theirs_label = opts.get("theirs_label", "theirs")
    base_label = opts.get("base_label", "base")

    base_lines = split_lines(base)
    ours_lines = split_lines(ours)
    theirs_lines = split_lines(theirs)

    # Find LCS of base with ours and theirs
    base_ours_lcs = _lcs_indices(base_lines, ours_lines)
    base_theirs_lcs = _lcs_indices(base_lines, theirs_lines)

    # Build maps: base_idx -> ours_idx, base_idx -> theirs_idx
    base_to_ours = {b: o for b, o in base_ours_lcs}
    base_to_theirs = {b: t for b, t in base_theirs_lcs}

    result_lines: List[str] = []
    conflicts: List[Conflict] = []

    base_idx = 0
    ours_idx = 0
    theirs_idx = 0

    while base_idx < len(base_lines) or ours_idx < len(ours_lines) or theirs_idx < len(theirs_lines):
        # Find next sync point in base that exists in both ours and theirs
        sync_base = None
        for bi in range(base_idx, len(base_lines)):
            if bi in base_to_ours and bi in base_to_theirs:
                sync_base = bi
                break

        if sync_base is not None:
            sync_ours = base_to_ours[sync_base]
            sync_theirs = base_to_theirs[sync_base]

            # Collect changes before sync point
            ours_before = ours_lines[ours_idx:sync_ours]
            theirs_before = theirs_lines[theirs_idx:sync_theirs]
            base_before = base_lines[base_idx:sync_base]

            # Handle the region before sync
            merged, region_conflicts = _merge_region(
                base_before, ours_before, theirs_before,
                conflict_style, ours_label, theirs_label, base_label,
                len(result_lines) + 1
            )
            result_lines.extend(merged)
            conflicts.extend(region_conflicts)

            # Add the sync line
            result_lines.append(base_lines[sync_base])
            base_idx = sync_base + 1
            ours_idx = sync_ours + 1
            theirs_idx = sync_theirs + 1
        else:
            # No more sync points - handle remaining lines
            ours_remaining = ours_lines[ours_idx:]
            theirs_remaining = theirs_lines[theirs_idx:]
            base_remaining = base_lines[base_idx:]

            merged, region_conflicts = _merge_region(
                base_remaining, ours_remaining, theirs_remaining,
                conflict_style, ours_label, theirs_label, base_label,
                len(result_lines) + 1
            )
            result_lines.extend(merged)
            conflicts.extend(region_conflicts)
            break

    content = "".join(result_lines)
    return {
        "content": content,
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts
    }


def _merge_region(
    base: List[str],
    ours: List[str],
    theirs: List[str],
    conflict_style: str,
    ours_label: str,
    theirs_label: str,
    base_label: str,
    start_line: int
) -> Tuple[List[str], List[Conflict]]:
    """Merge a region between sync points."""
    result: List[str] = []
    conflicts: List[Conflict] = []

    # Simple cases
    if not base and not ours and not theirs:
        return result, conflicts

    if ours == theirs:
        # Both same - use either
        return list(ours), conflicts

    if ours == base:
        # Only theirs changed
        return list(theirs), conflicts

    if theirs == base:
        # Only ours changed
        return list(ours), conflicts

    # When all three have the same length, try line-by-line merge
    if len(base) == len(ours) == len(theirs):
        can_merge = True
        merged_lines: List[str] = []
        for i in range(len(base)):
            b, o, t = base[i], ours[i], theirs[i]
            if o == t:
                # Both same (could be same as base or both changed same)
                merged_lines.append(o)
            elif o == b:
                # Only theirs changed
                merged_lines.append(t)
            elif t == b:
                # Only ours changed
                merged_lines.append(o)
            else:
                # Both changed differently - conflict
                can_merge = False
                break

        if can_merge:
            return merged_lines, conflicts

    # Fall back to treating entire region as conflict
    base_content = "".join(base)
    ours_content = "".join(ours)
    theirs_content = "".join(theirs)

    conflict_start = start_line
    result.append(f"<<<<<<< {ours_label}\n")
    result.extend(ours)
    if conflict_style == "diff3":
        result.append(f"||||||| {base_label}\n")
        result.extend(base)
    result.append("=======\n")
    result.extend(theirs)
    result.append(f">>>>>>> {theirs_label}\n")
    conflict_end = start_line + len(result) - 1

    conflicts.append({
        "base": base_content,
        "ours": ours_content,
        "theirs": theirs_content,
        "start_line": conflict_start,
        "end_line": conflict_end
    })

    return result, conflicts


def has_conflicts(content: str) -> bool:
    """Check if content contains conflict markers."""
    has_start = "<<<<<<" in content
    has_middle = "======" in content
    has_end = ">>>>>>" in content
    return has_start and has_middle and has_end


def extract_conflicts(content: str) -> List[Conflict]:
    """Extract conflict regions from merged content."""
    conflicts: List[Conflict] = []
    lines = content.split("\n")

    i = 0
    while i < len(lines):
        line = lines[i]

        if line.startswith("<<<<<<<"):
            start_line = i + 1
            ours_lines: List[str] = []
            base_lines: List[str] = []
            theirs_lines: List[str] = []

            i += 1
            section = "ours"

            while i < len(lines):
                line = lines[i]
                if line.startswith("|||||||"):
                    section = "base"
                    i += 1
                    continue
                elif line.startswith("======="):
                    section = "theirs"
                    i += 1
                    continue
                elif line.startswith(">>>>>>>"):
                    end_line = i + 1
                    conflicts.append({
                        "ours": "\n".join(ours_lines) + ("\n" if ours_lines else ""),
                        "base": "\n".join(base_lines) + ("\n" if base_lines else ""),
                        "theirs": "\n".join(theirs_lines) + ("\n" if theirs_lines else ""),
                        "start_line": start_line,
                        "end_line": end_line
                    })
                    break
                else:
                    if section == "ours":
                        ours_lines.append(line)
                    elif section == "base":
                        base_lines.append(line)
                    else:
                        theirs_lines.append(line)
                i += 1
        i += 1

    return conflicts


def resolve_conflict(
    content: str,
    conflict_index: int,
    resolution: str
) -> str:
    """Resolve a specific conflict in the content."""
    conflicts = extract_conflicts(content)

    if conflict_index < 0 or conflict_index >= len(conflicts):
        return content

    conflict = conflicts[conflict_index]

    if resolution == "ours":
        replacement = conflict["ours"]
    elif resolution == "theirs":
        replacement = conflict["theirs"]
    elif resolution == "base":
        replacement = conflict["base"]
    else:
        replacement = resolution

    lines = content.split("\n")
    result_lines: List[str] = []
    current_conflict = 0
    i = 0

    while i < len(lines):
        line = lines[i]

        if line.startswith("<<<<<<<"):
            if current_conflict == conflict_index:
                while i < len(lines) and not lines[i].startswith(">>>>>>>"):
                    i += 1
                i += 1

                if replacement:
                    rep_lines = replacement.rstrip("\n").split("\n")
                    for rline in rep_lines:
                        result_lines.append(rline)
                current_conflict += 1
            else:
                result_lines.append(line)
                i += 1
                current_conflict += 1
        else:
            result_lines.append(line)
            i += 1

    return "\n".join(result_lines)
