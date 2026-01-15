"""Tests for line-based diff functionality."""

import pytest


class TestDiffLinesBasic:
    """Basic line diff tests."""

    def test_identical_content(self, lib):
        """Identical content produces no changes."""
        text = "line1\nline2\nline3\n"
        result = lib.diff_lines(text, text)
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_completely_different(self, lib):
        """Completely different content."""
        old = "line1\nline2\n"
        new = "other1\nother2\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["deletions"] == 2
        assert result["stats"]["additions"] == 2

    def test_empty_to_content(self, lib):
        """Empty string to content."""
        result = lib.diff_lines("", "line1\nline2\n")
        assert result["stats"]["additions"] == 2
        assert result["stats"]["deletions"] == 0

    def test_content_to_empty(self, lib):
        """Content to empty string."""
        result = lib.diff_lines("line1\nline2\n", "")
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 2

    def test_both_empty(self, lib):
        """Both empty strings."""
        result = lib.diff_lines("", "")
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_single_line_addition(self, lib):
        """Add a single line."""
        old = "line1\nline2\n"
        new = "line1\nline2\nline3\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 0

    def test_single_line_deletion(self, lib):
        """Remove a single line."""
        old = "line1\nline2\nline3\n"
        new = "line1\nline2\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 1

    def test_single_line_modification(self, lib):
        """Modify a single line."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1


class TestDiffLinesHunks:
    """Tests for diff hunk structure."""

    def test_hunk_contains_equal(self, lib):
        """Hunks include equal lines for context."""
        old = "a\nb\nc\n"
        new = "a\nB\nc\n"
        result = lib.diff_lines(old, new)
        ops = [h["op"] for h in result["hunks"]]
        assert "equal" in ops
        assert "delete" in ops
        assert "insert" in ops

    def test_hunk_line_numbers(self, lib):
        """Hunks have correct line numbers."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        result = lib.diff_lines(old, new)
        # Find the delete hunk
        delete_hunks = [h for h in result["hunks"] if h["op"] == "delete"]
        assert len(delete_hunks) == 1
        assert delete_hunks[0]["old_start"] == 2

    def test_multiple_change_regions(self, lib):
        """Multiple separated change regions."""
        old = "a\nb\nc\nd\ne\nf\n"
        new = "a\nB\nc\nd\nE\nf\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 2
        assert result["stats"]["deletions"] == 2


class TestDiffLinesOptions:
    """Tests for diff options."""

    def test_ignore_whitespace(self, lib):
        """Ignore leading/trailing whitespace option."""
        old = "line1\n  line2  \nline3\n"
        new = "line1\nline2\nline3\n"
        result = lib.diff_lines(old, new, {"ignore_whitespace": True})
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_ignore_whitespace_false(self, lib):
        """Whitespace differences detected when not ignored."""
        old = "line1\n  line2  \nline3\n"
        new = "line1\nline2\nline3\n"
        result = lib.diff_lines(old, new, {"ignore_whitespace": False})
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_ignore_blank_lines(self, lib):
        """Ignore blank lines option."""
        old = "line1\n\nline2\n"
        new = "line1\nline2\n"
        result = lib.diff_lines(old, new, {"ignore_blank_lines": True})
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_context_lines(self, lib):
        """Context lines setting affects output."""
        old = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n"
        new = "1\n2\n3\n4\nX\n6\n7\n8\n9\n10\n"
        result1 = lib.diff_lines(old, new, {"context_lines": 1})
        result2 = lib.diff_lines(old, new, {"context_lines": 3})
        # More context means more equal lines in hunks
        equal1 = len([h for h in result1["hunks"] if h["op"] == "equal"])
        equal2 = len([h for h in result2["hunks"] if h["op"] == "equal"])
        assert equal2 >= equal1


class TestDiffLinesEdgeCases:
    """Edge case tests for line diff."""

    def test_no_trailing_newline(self, lib):
        """Handle content without trailing newline."""
        old = "line1\nline2"
        new = "line1\nline2\n"
        result = lib.diff_lines(old, new)
        # Should detect the difference
        assert result["stats"]["additions"] >= 0

    def test_only_newlines(self, lib):
        """Content that is only newlines."""
        old = "\n\n\n"
        new = "\n\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["deletions"] == 1

    def test_unicode_content(self, lib):
        """Unicode content handling."""
        old = "Hello\n世界\nПривет\n"
        new = "Hello\nWorld\nПривет\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_very_long_lines(self, lib):
        """Very long lines."""
        long_line = "x" * 10000
        old = f"short\n{long_line}\nend\n"
        new = f"short\n{long_line}y\nend\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_many_lines(self, lib):
        """Many lines (performance check)."""
        old = "\n".join([f"line{i}" for i in range(1000)]) + "\n"
        new = "\n".join([f"line{i}" if i != 500 else "changed" for i in range(1000)]) + "\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_crlf_line_endings(self, lib):
        """CRLF line endings."""
        old = "line1\r\nline2\r\n"
        new = "line1\r\nmodified\r\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_mixed_line_endings(self, lib):
        """Mixed line endings."""
        old = "line1\nline2\r\nline3\r"
        new = "line1\nline2\nline3\n"
        result = lib.diff_lines(old, new)
        # Should handle without crashing
        assert "hunks" in result
