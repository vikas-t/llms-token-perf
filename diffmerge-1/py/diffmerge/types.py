"""Type definitions for the diffmerge library."""

from typing import TypedDict, Literal, List, Optional


# Diff operation types
DiffOp = Literal["equal", "insert", "delete"]


class DiffHunk(TypedDict, total=False):
    """A single diff hunk."""
    op: DiffOp
    content: str
    old_start: int  # line number in original (1-indexed)
    new_start: int  # line number in new (1-indexed)
    old_count: int  # number of lines in original
    new_count: int  # number of lines in new


class DiffStats(TypedDict):
    """Statistics for a diff result."""
    additions: int
    deletions: int
    changes: int  # lines that were modified (delete+insert pairs)


class DiffResult(TypedDict):
    """Result of a diff operation."""
    hunks: List[DiffHunk]
    stats: DiffStats


class DiffOptions(TypedDict, total=False):
    """Options for diff operations."""
    ignore_whitespace: bool
    ignore_blank_lines: bool
    context_lines: int


class Conflict(TypedDict):
    """A merge conflict region."""
    base: str
    ours: str
    theirs: str
    start_line: int
    end_line: int


class MergeResult(TypedDict):
    """Result of a merge operation."""
    content: str
    has_conflicts: bool
    conflicts: List[Conflict]


class MergeOptions(TypedDict, total=False):
    """Options for merge operations."""
    conflict_style: Literal["diff3", "merge"]
    ours_label: str
    theirs_label: str
    base_label: str


class ApplyResult(TypedDict):
    """Result of applying a patch."""
    content: str
    success: bool
    hunks_applied: int
    hunks_failed: int
    errors: List[str]


class PatchLine(TypedDict):
    """A single line in a patch."""
    op: Literal[" ", "+", "-"]
    content: str


class PatchHunk(TypedDict):
    """A hunk in a parsed patch."""
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[PatchLine]


class ParsedPatch(TypedDict):
    """A parsed unified diff patch."""
    old_file: str
    new_file: str
    hunks: List[PatchHunk]


class PatchOptions(TypedDict, total=False):
    """Options for patch creation."""
    old_file: str
    new_file: str
    context_lines: int


class DiffError(Exception):
    """Base error for diff operations."""
    pass


class PatchError(Exception):
    """Error applying patch."""
    pass


class ParseError(Exception):
    """Error parsing patch format."""
    pass


class MergeError(Exception):
    """Error during merge operation."""
    pass
