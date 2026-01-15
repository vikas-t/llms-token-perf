"""Diff/Merge library for computing diffs, applying patches, and three-way merges."""

from .diff import diff_lines, diff_words, diff_chars
from .patch import create_patch, apply_patch, reverse_patch, parse_patch
from .merge import merge3, has_conflicts, extract_conflicts, resolve_conflict
from .utils import get_stats, is_binary, normalize_line_endings, split_lines
from .types import (
    DiffOp, DiffHunk, DiffResult, DiffStats, DiffOptions,
    Conflict, MergeResult, MergeOptions,
    ApplyResult, PatchLine, PatchHunk, ParsedPatch, PatchOptions,
    DiffError, PatchError, ParseError, MergeError,
)

__all__ = [
    # Diff functions
    "diff_lines", "diff_words", "diff_chars",
    # Patch functions
    "create_patch", "apply_patch", "reverse_patch", "parse_patch",
    # Merge functions
    "merge3", "has_conflicts", "extract_conflicts", "resolve_conflict",
    # Utility functions
    "get_stats", "is_binary", "normalize_line_endings", "split_lines",
    # Types
    "DiffOp", "DiffHunk", "DiffResult", "DiffStats", "DiffOptions",
    "Conflict", "MergeResult", "MergeOptions",
    "ApplyResult", "PatchLine", "PatchHunk", "ParsedPatch", "PatchOptions",
    # Errors
    "DiffError", "PatchError", "ParseError", "MergeError",
]
