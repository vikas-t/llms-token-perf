"""Tests for utility functions."""

import pytest


class TestIsBinary:
    """Tests for binary detection."""

    def test_text_content(self, lib):
        """Normal text is not binary."""
        assert lib.is_binary("Hello, World!\n") is False

    def test_binary_with_null(self, lib):
        """Content with null byte is binary."""
        assert lib.is_binary("Hello\x00World") is True

    def test_empty_string(self, lib):
        """Empty string is not binary."""
        assert lib.is_binary("") is False

    def test_unicode_text(self, lib):
        """Unicode text is not binary."""
        assert lib.is_binary("Hello 世界 Привет 🌍") is False

    def test_high_bytes(self, lib):
        """High byte content detection."""
        # Many non-printable chars might indicate binary
        content = "".join(chr(i) for i in range(256))
        # This contains null, so should be binary
        assert lib.is_binary(content) is True

    def test_just_whitespace(self, lib):
        """Only whitespace is not binary."""
        assert lib.is_binary("   \n\t\r  ") is False


class TestNormalizeLineEndings:
    """Tests for line ending normalization."""

    def test_lf_unchanged(self, lib):
        """LF endings remain unchanged."""
        content = "line1\nline2\nline3\n"
        result = lib.normalize_line_endings(content)
        assert result == content

    def test_crlf_to_lf(self, lib):
        """CRLF converted to LF."""
        content = "line1\r\nline2\r\nline3\r\n"
        result = lib.normalize_line_endings(content)
        assert result == "line1\nline2\nline3\n"

    def test_cr_to_lf(self, lib):
        """CR converted to LF."""
        content = "line1\rline2\rline3\r"
        result = lib.normalize_line_endings(content)
        assert result == "line1\nline2\nline3\n"

    def test_mixed_endings(self, lib):
        """Mixed endings all converted to LF."""
        content = "line1\nline2\r\nline3\rline4\n"
        result = lib.normalize_line_endings(content)
        assert "\r" not in result
        assert result.count("\n") == 4

    def test_empty_string(self, lib):
        """Empty string unchanged."""
        assert lib.normalize_line_endings("") == ""

    def test_no_line_endings(self, lib):
        """Content without line endings."""
        content = "no line ending"
        result = lib.normalize_line_endings(content)
        assert result == content


class TestDiffStats:
    """Tests for diff statistics."""

    def test_stats_additions(self, lib):
        """Count additions correctly."""
        old = "line1\n"
        new = "line1\nline2\nline3\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 2

    def test_stats_deletions(self, lib):
        """Count deletions correctly."""
        old = "line1\nline2\nline3\n"
        new = "line1\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["deletions"] == 2

    def test_stats_changes(self, lib):
        """Count changed lines."""
        old = "line1\nline2\nline3\n"
        new = "line1\nMODIFIED\nline3\n"
        result = lib.diff_lines(old, new)
        # Changed = 1 deletion + 1 addition on same logical line
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_stats_no_changes(self, lib):
        """No changes gives zero stats."""
        text = "line1\nline2\n"
        result = lib.diff_lines(text, text)
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_stats_completely_different(self, lib):
        """Completely different content."""
        old = "aaa\nbbb\nccc\n"
        new = "xxx\nyyy\nzzz\n"
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 3
        assert result["stats"]["deletions"] == 3


class TestLargeContent:
    """Performance tests with large content."""

    def test_large_identical_files(self, lib):
        """Large identical files."""
        content = "line\n" * 10000
        result = lib.diff_lines(content, content)
        assert result["stats"]["additions"] == 0
        assert result["stats"]["deletions"] == 0

    def test_large_file_small_change(self, lib):
        """Large file with small change."""
        lines = [f"line{i}\n" for i in range(10000)]
        old = "".join(lines)
        lines[5000] = "MODIFIED\n"
        new = "".join(lines)
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 1
        assert result["stats"]["deletions"] == 1

    def test_large_file_many_changes(self, lib):
        """Large file with many scattered changes."""
        old_lines = [f"line{i}\n" for i in range(1000)]
        new_lines = [f"line{i}\n" if i % 100 != 0 else f"MODIFIED{i}\n" for i in range(1000)]
        old = "".join(old_lines)
        new = "".join(new_lines)
        result = lib.diff_lines(old, new)
        assert result["stats"]["additions"] == 10
        assert result["stats"]["deletions"] == 10

    def test_merge_large_files(self, lib):
        """Merge large files."""
        base_lines = [f"line{i}\n" for i in range(1000)]
        base = "".join(base_lines)

        our_lines = base_lines.copy()
        our_lines[100] = "OUR CHANGE\n"
        ours = "".join(our_lines)

        their_lines = base_lines.copy()
        their_lines[900] = "THEIR CHANGE\n"
        theirs = "".join(their_lines)

        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert "OUR CHANGE" in result["content"]
        assert "THEIR CHANGE" in result["content"]


class TestRoundTrip:
    """Tests for patch round-trip consistency."""

    def test_roundtrip_simple(self, lib):
        """Simple diff/patch roundtrip."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["content"] == new

    def test_roundtrip_reverse(self, lib):
        """Reverse patch roundtrip."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)

        # Forward: old -> new
        result1 = lib.apply_patch(old, patch)
        assert result1["content"] == new

        # Reverse: new -> old
        reversed_patch = lib.reverse_patch(patch)
        result2 = lib.apply_patch(new, reversed_patch)
        assert result2["content"] == old

    def test_roundtrip_multiple_changes(self, lib):
        """Multiple changes roundtrip."""
        old = "a\nb\nc\nd\ne\n"
        new = "A\nb\nC\nd\nE\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["content"] == new

    def test_roundtrip_additions_only(self, lib):
        """Additions only roundtrip."""
        old = "line1\n"
        new = "line1\nline2\nline3\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["content"] == new

    def test_roundtrip_deletions_only(self, lib):
        """Deletions only roundtrip."""
        old = "line1\nline2\nline3\n"
        new = "line1\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["content"] == new

    def test_roundtrip_unicode(self, lib):
        """Unicode content roundtrip."""
        old = "Hello\n世界\nПривет\n"
        new = "Hello\nWorld\nПривет\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["content"] == new
