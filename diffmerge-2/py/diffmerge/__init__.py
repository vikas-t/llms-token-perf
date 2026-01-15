"""Diff/Merge library - A comprehensive library for computing diffs, patches, and merges."""

from .types import (
    DiffOp, DiffHunk, DiffStats, DiffResult, DiffOptions,
    PatchOp, PatchLine, PatchHunk, ParsedPatch, ApplyResult, PatchOptions,
    Conflict, MergeResult, MergeOptions,
    DiffError, PatchError, ParseError, MergeError,
)

from .diff import diff_lines, diff_words, diff_chars

from .patch import create_patch, apply_patch, reverse_patch, parse_patch

from .merge import merge3, has_conflicts, extract_conflicts, resolve_conflict

from .utils import get_stats, is_binary, normalize_line_endings, split_lines

__all__ = [
    # Types
    "DiffOp", "DiffHunk", "DiffStats", "DiffResult", "DiffOptions",
    "PatchOp", "PatchLine", "PatchHunk", "ParsedPatch", "ApplyResult", "PatchOptions",
    "Conflict", "MergeResult", "MergeOptions",
    "DiffError", "PatchError", "ParseError", "MergeError",
    # Diff functions
    "diff_lines", "diff_words", "diff_chars",
    # Patch functions
    "create_patch", "apply_patch", "reverse_patch", "parse_patch",
    # Merge functions
    "merge3", "has_conflicts", "extract_conflicts", "resolve_conflict",
    # Utility functions
    "get_stats", "is_binary", "normalize_line_endings", "split_lines",
]
