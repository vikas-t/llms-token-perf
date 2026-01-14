"""Type definitions for the diffmerge library."""

from dataclasses import dataclass, field
from typing import List, Optional, Literal


# Diff types
DiffOp = Literal["equal", "insert", "delete"]


@dataclass
class DiffHunk:
    """A single diff hunk representing a change or equal section."""
    op: DiffOp
    content: str
    old_start: Optional[int] = None
    new_start: Optional[int] = None
    old_count: Optional[int] = None
    new_count: Optional[int] = None

    def to_dict(self) -> dict:
        result = {"op": self.op, "content": self.content}
        if self.old_start is not None:
            result["old_start"] = self.old_start
        if self.new_start is not None:
            result["new_start"] = self.new_start
        if self.old_count is not None:
            result["old_count"] = self.old_count
        if self.new_count is not None:
            result["new_count"] = self.new_count
        return result


@dataclass
class DiffStats:
    """Statistics about a diff."""
    additions: int = 0
    deletions: int = 0
    changes: int = 0

    def to_dict(self) -> dict:
        return {
            "additions": self.additions,
            "deletions": self.deletions,
            "changes": self.changes,
        }


@dataclass
class DiffResult:
    """Result of a diff operation."""
    hunks: List[DiffHunk] = field(default_factory=list)
    stats: DiffStats = field(default_factory=DiffStats)

    def to_dict(self) -> dict:
        return {
            "hunks": [h.to_dict() for h in self.hunks],
            "stats": self.stats.to_dict(),
        }


@dataclass
class DiffOptions:
    """Options for diff operations."""
    ignore_whitespace: bool = False
    ignore_blank_lines: bool = False
    context_lines: int = 3


# Patch types
PatchOp = Literal[" ", "+", "-"]


@dataclass
class PatchLine:
    """A single line in a patch."""
    op: PatchOp
    content: str

    def to_dict(self) -> dict:
        return {"op": self.op, "content": self.content}


@dataclass
class PatchHunk:
    """A hunk in a unified diff patch."""
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[PatchLine] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "old_start": self.old_start,
            "old_count": self.old_count,
            "new_start": self.new_start,
            "new_count": self.new_count,
            "lines": [l.to_dict() for l in self.lines],
        }


@dataclass
class ParsedPatch:
    """Parsed unified diff patch."""
    old_file: str
    new_file: str
    hunks: List[PatchHunk] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "old_file": self.old_file,
            "new_file": self.new_file,
            "hunks": [h.to_dict() for h in self.hunks],
        }


@dataclass
class ApplyResult:
    """Result of applying a patch."""
    content: str
    success: bool
    hunks_applied: int = 0
    hunks_failed: int = 0
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "success": self.success,
            "hunks_applied": self.hunks_applied,
            "hunks_failed": self.hunks_failed,
            "errors": self.errors,
        }


@dataclass
class PatchOptions:
    """Options for patch creation."""
    old_file: str = "a"
    new_file: str = "b"
    context_lines: int = 3


# Merge types
@dataclass
class Conflict:
    """A merge conflict region."""
    base: str
    ours: str
    theirs: str
    start_line: int = 0
    end_line: int = 0

    def to_dict(self) -> dict:
        return {
            "base": self.base,
            "ours": self.ours,
            "theirs": self.theirs,
            "start_line": self.start_line,
            "end_line": self.end_line,
        }


@dataclass
class MergeResult:
    """Result of a merge operation."""
    content: str
    has_conflicts: bool
    conflicts: List[Conflict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "has_conflicts": self.has_conflicts,
            "conflicts": [c.to_dict() for c in self.conflicts],
        }


@dataclass
class MergeOptions:
    """Options for merge operations."""
    conflict_style: Literal["merge", "diff3"] = "merge"
    ours_label: str = "ours"
    theirs_label: str = "theirs"
    base_label: str = "base"


# Errors
class DiffError(Exception):
    """Base error for diff operations."""
    pass


class PatchError(DiffError):
    """Error applying patch."""
    pass


class ParseError(DiffError):
    """Error parsing patch format."""
    pass


class MergeError(DiffError):
    """Error during merge operation."""
    pass
