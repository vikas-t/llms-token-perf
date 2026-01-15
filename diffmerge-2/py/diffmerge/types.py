"""Type definitions for diffmerge library."""

from typing import List, Optional, Literal, TypedDict


# Diff types
DiffOp = Literal["equal", "insert", "delete"]


class DiffHunk(TypedDict, total=False):
    """A single diff operation."""
    op: DiffOp
    content: str
    old_start: int
    new_start: int
    old_count: int
    new_count: int


class DiffStats(TypedDict):
    """Statistics about a diff."""
    additions: int
    deletions: int
    changes: int


class DiffResult(TypedDict):
    """Result of a diff operation."""
    hunks: List[DiffHunk]
    stats: DiffStats


class DiffOptions(TypedDict, total=False):
    """Options for diff operations."""
    ignore_whitespace: bool
    ignore_blank_lines: bool
    context_lines: int


# Patch types
PatchOp = Literal[" ", "+", "-"]


class PatchLine(TypedDict):
    """A single line in a patch hunk."""
    op: PatchOp
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


class ApplyResult(TypedDict):
    """Result of applying a patch."""
    content: str
    success: bool
    hunks_applied: int
    hunks_failed: int
    errors: List[str]


class PatchOptions(TypedDict, total=False):
    """Options for patch creation."""
    old_file: str
    new_file: str
    context_lines: int


# Merge types
class Conflict(TypedDict):
    """A merge conflict."""
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


# Errors
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
