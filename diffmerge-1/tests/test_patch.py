"""Tests for patch creation and application."""

import pytest


class TestCreatePatch:
    """Tests for patch creation."""

    def test_create_patch_basic(self, lib):
        """Create basic unified diff patch."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        assert "---" in patch
        assert "+++" in patch
        assert "@@" in patch
        assert "-line2" in patch
        assert "+modified" in patch

    def test_create_patch_addition(self, lib):
        """Patch with only additions."""
        old = "line1\nline2\n"
        new = "line1\nline2\nline3\n"
        patch = lib.create_patch(old, new)
        assert "+line3" in patch
        assert "-" not in patch or "---" in patch  # Only header minus

    def test_create_patch_deletion(self, lib):
        """Patch with only deletions."""
        old = "line1\nline2\nline3\n"
        new = "line1\nline2\n"
        patch = lib.create_patch(old, new)
        assert "-line3" in patch

    def test_create_patch_no_changes(self, lib):
        """No changes produces minimal or empty patch."""
        text = "line1\nline2\n"
        patch = lib.create_patch(text, text)
        # Should not have any +/- lines (except headers)
        lines = patch.split("\n")
        change_lines = [l for l in lines if l.startswith("+") or l.startswith("-")]
        header_lines = [l for l in change_lines if l.startswith("---") or l.startswith("+++")]
        assert len(change_lines) == len(header_lines)

    def test_create_patch_file_names(self, lib):
        """Custom file names in patch."""
        old = "line1\n"
        new = "line2\n"
        patch = lib.create_patch(old, new, {"old_file": "original.txt", "new_file": "modified.txt"})
        assert "original.txt" in patch
        assert "modified.txt" in patch

    def test_create_patch_context_lines(self, lib):
        """Custom context lines."""
        old = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n"
        new = "1\n2\n3\n4\nX\n6\n7\n8\n9\n10\n"
        patch1 = lib.create_patch(old, new, {"context_lines": 1})
        patch3 = lib.create_patch(old, new, {"context_lines": 3})
        # More context = longer patch
        assert len(patch3) >= len(patch1)

    def test_create_patch_empty_old(self, lib):
        """Patch from empty to content."""
        patch = lib.create_patch("", "new content\n")
        assert "+new content" in patch

    def test_create_patch_empty_new(self, lib):
        """Patch from content to empty."""
        patch = lib.create_patch("old content\n", "")
        assert "-old content" in patch

    def test_create_patch_hunk_header(self, lib):
        """Hunk headers have correct format."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        # Find @@ line
        for line in patch.split("\n"):
            if line.startswith("@@"):
                # Format: @@ -start,count +start,count @@
                assert "-" in line
                assert "+" in line
                break
        else:
            pytest.fail("No hunk header found")


class TestApplyPatch:
    """Tests for applying patches."""

    def test_apply_patch_basic(self, lib):
        """Apply basic patch."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["success"] is True
        assert result["content"] == new

    def test_apply_patch_addition(self, lib):
        """Apply patch with additions."""
        old = "line1\nline2\n"
        new = "line1\nline2\nline3\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["success"] is True
        assert result["content"] == new

    def test_apply_patch_deletion(self, lib):
        """Apply patch with deletions."""
        old = "line1\nline2\nline3\n"
        new = "line1\nline2\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["success"] is True
        assert result["content"] == new

    def test_apply_patch_multiple_hunks(self, lib):
        """Apply patch with multiple hunks."""
        old = "a\nb\nc\nd\ne\nf\ng\nh\n"
        new = "a\nB\nc\nd\ne\nF\ng\nh\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["success"] is True
        assert result["content"] == new

    def test_apply_patch_wrong_base(self, lib):
        """Fail to apply patch to wrong base."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        wrong_base = "different\ncontent\nhere\n"
        result = lib.apply_patch(wrong_base, patch)
        assert result["success"] is False
        assert result["hunks_failed"] > 0

    def test_apply_patch_already_applied(self, lib):
        """Applying patch twice."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(new, patch)
        # Either fails or is idempotent
        assert "success" in result

    def test_apply_patch_empty_patch(self, lib):
        """Apply empty/no-op patch."""
        content = "line1\nline2\n"
        patch = lib.create_patch(content, content)
        result = lib.apply_patch(content, patch)
        assert result["success"] is True
        assert result["content"] == content

    def test_apply_patch_stats(self, lib):
        """Apply result has correct statistics."""
        old = "a\nb\nc\n"
        new = "a\nB\nc\n"
        patch = lib.create_patch(old, new)
        result = lib.apply_patch(old, patch)
        assert result["hunks_applied"] >= 1


class TestReversePatch:
    """Tests for reversing patches."""

    def test_reverse_patch_basic(self, lib):
        """Reverse patch swaps additions and deletions."""
        old = "line1\nline2\n"
        new = "line1\nmodified\n"
        patch = lib.create_patch(old, new)
        reversed_patch = lib.reverse_patch(patch)
        # Apply reversed patch to new should give old
        result = lib.apply_patch(new, reversed_patch)
        assert result["success"] is True
        assert result["content"] == old

    def test_reverse_patch_additions(self, lib):
        """Reverse patch with only additions."""
        old = "line1\n"
        new = "line1\nline2\n"
        patch = lib.create_patch(old, new)
        reversed_patch = lib.reverse_patch(patch)
        result = lib.apply_patch(new, reversed_patch)
        assert result["success"] is True
        assert result["content"] == old

    def test_reverse_patch_deletions(self, lib):
        """Reverse patch with only deletions."""
        old = "line1\nline2\n"
        new = "line1\n"
        patch = lib.create_patch(old, new)
        reversed_patch = lib.reverse_patch(patch)
        result = lib.apply_patch(new, reversed_patch)
        assert result["success"] is True
        assert result["content"] == old

    def test_double_reverse(self, lib):
        """Double reverse gives original patch."""
        old = "line1\nline2\n"
        new = "line1\nmodified\n"
        patch = lib.create_patch(old, new)
        reversed_once = lib.reverse_patch(patch)
        reversed_twice = lib.reverse_patch(reversed_once)
        # Apply double-reversed to old should give new
        result = lib.apply_patch(old, reversed_twice)
        assert result["success"] is True
        assert result["content"] == new


class TestParsePatch:
    """Tests for parsing patches."""

    def test_parse_patch_basic(self, lib):
        """Parse basic patch structure."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        parsed = lib.parse_patch(patch)
        assert "old_file" in parsed
        assert "new_file" in parsed
        assert "hunks" in parsed
        assert len(parsed["hunks"]) >= 1

    def test_parse_patch_hunk_structure(self, lib):
        """Parse hunk structure correctly."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        parsed = lib.parse_patch(patch)
        hunk = parsed["hunks"][0]
        assert "old_start" in hunk
        assert "old_count" in hunk
        assert "new_start" in hunk
        assert "new_count" in hunk
        assert "lines" in hunk

    def test_parse_patch_lines(self, lib):
        """Parse patch lines correctly."""
        old = "line1\nline2\nline3\n"
        new = "line1\nmodified\nline3\n"
        patch = lib.create_patch(old, new)
        parsed = lib.parse_patch(patch)
        lines = parsed["hunks"][0]["lines"]
        ops = [l["op"] for l in lines]
        assert " " in ops  # Context
        assert "-" in ops  # Deletion
        assert "+" in ops  # Addition

    def test_parse_patch_file_names(self, lib):
        """Parse file names from patch."""
        old = "content\n"
        new = "modified\n"
        patch = lib.create_patch(old, new, {"old_file": "old.txt", "new_file": "new.txt"})
        parsed = lib.parse_patch(patch)
        assert "old.txt" in parsed["old_file"]
        assert "new.txt" in parsed["new_file"]

    def test_parse_patch_multiple_hunks(self, lib):
        """Parse patch with multiple hunks."""
        old = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n"
        new = "a\nB\nc\nd\ne\nf\nG\nh\ni\nj\n"
        patch = lib.create_patch(old, new, {"context_lines": 1})
        parsed = lib.parse_patch(patch)
        # With small context, should have multiple hunks
        assert len(parsed["hunks"]) >= 1

    def test_parse_invalid_patch(self, lib):
        """Handle invalid patch format."""
        with pytest.raises(Exception):
            lib.parse_patch("not a valid patch")
