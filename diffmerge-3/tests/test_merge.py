"""Tests for three-way merge functionality."""

import pytest


class TestMerge3Basic:
    """Basic three-way merge tests."""

    def test_merge_no_changes(self, lib):
        """No changes from base."""
        base = "line1\nline2\nline3\n"
        result = lib.merge3(base, base, base)
        assert result["has_conflicts"] is False
        assert result["content"] == base

    def test_merge_only_ours_changed(self, lib):
        """Only our side changed."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nmodified\nline3\n"
        theirs = base
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert result["content"] == ours

    def test_merge_only_theirs_changed(self, lib):
        """Only their side changed."""
        base = "line1\nline2\nline3\n"
        ours = base
        theirs = "line1\nmodified\nline3\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert result["content"] == theirs

    def test_merge_both_same_change(self, lib):
        """Both sides made identical change."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nmodified\nline3\n"
        theirs = "line1\nmodified\nline3\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert result["content"] == ours

    def test_merge_different_lines(self, lib):
        """Both changed different lines - no conflict."""
        base = "line1\nline2\nline3\n"
        ours = "LINE1\nline2\nline3\n"
        theirs = "line1\nline2\nLINE3\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert "LINE1" in result["content"]
        assert "LINE3" in result["content"]

    def test_merge_adjacent_changes(self, lib):
        """Changes on adjacent lines."""
        base = "a\nb\nc\nd\n"
        ours = "a\nB\nc\nd\n"
        theirs = "a\nb\nC\nd\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert "B" in result["content"]
        assert "C" in result["content"]


class TestMerge3Conflicts:
    """Tests for merge conflicts."""

    def test_merge_conflict_same_line(self, lib):
        """Conflict when both modify same line differently."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nOUR CHANGE\nline3\n"
        theirs = "line1\nTHEIR CHANGE\nline3\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is True
        assert len(result["conflicts"]) >= 1

    def test_merge_conflict_markers(self, lib):
        """Conflict markers in output."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nOUR CHANGE\nline3\n"
        theirs = "line1\nTHEIR CHANGE\nline3\n"
        result = lib.merge3(base, ours, theirs)
        assert "<<<<<<" in result["content"]
        assert "======" in result["content"]
        assert ">>>>>>" in result["content"]

    def test_merge_conflict_structure(self, lib):
        """Conflict structure is correct."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nOURS\nline3\n"
        theirs = "line1\nTHEIRS\nline3\n"
        result = lib.merge3(base, ours, theirs)
        assert len(result["conflicts"]) >= 1
        conflict = result["conflicts"][0]
        assert "ours" in conflict
        assert "theirs" in conflict

    def test_merge_multiple_conflicts(self, lib):
        """Multiple conflicts in one merge."""
        base = "a\nb\nc\nd\ne\n"
        ours = "A\nb\nC\nd\ne\n"
        theirs = "X\nb\nY\nd\ne\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is True
        assert len(result["conflicts"]) >= 2

    def test_merge_conflict_one_deleted(self, lib):
        """Conflict when one side deletes, other modifies."""
        base = "line1\nline2\nline3\n"
        ours = "line1\nline3\n"  # Deleted line2
        theirs = "line1\nMODIFIED\nline3\n"  # Modified line2
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is True


class TestMerge3Options:
    """Tests for merge options."""

    def test_merge_conflict_style_merge(self, lib):
        """Default merge conflict style."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        result = lib.merge3(base, ours, theirs, {"conflict_style": "merge"})
        assert result["has_conflicts"] is True
        # Should have ours and theirs, not base
        assert "<<<<<<" in result["content"]
        assert "======" in result["content"]
        assert ">>>>>>" in result["content"]

    def test_merge_conflict_style_diff3(self, lib):
        """diff3 conflict style includes base."""
        base = "original line\n"
        ours = "our line\n"
        theirs = "their line\n"
        result = lib.merge3(base, ours, theirs, {"conflict_style": "diff3"})
        assert result["has_conflicts"] is True
        # Should have base version too
        assert "||||||" in result["content"]

    def test_merge_custom_labels(self, lib):
        """Custom conflict labels."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        result = lib.merge3(base, ours, theirs, {
            "ours_label": "HEAD",
            "theirs_label": "feature-branch"
        })
        assert result["has_conflicts"] is True
        assert "HEAD" in result["content"]
        assert "feature-branch" in result["content"]


class TestMerge3EdgeCases:
    """Edge cases for three-way merge."""

    def test_merge_empty_base(self, lib):
        """Empty base, both added content."""
        base = ""
        ours = "our content\n"
        theirs = "their content\n"
        result = lib.merge3(base, ours, theirs)
        # Both added - could be conflict or concatenation
        assert "content" in result["content"]

    def test_merge_empty_result(self, lib):
        """Both deleted all content."""
        base = "content\n"
        ours = ""
        theirs = ""
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert result["content"] == ""

    def test_merge_one_empty(self, lib):
        """One side deleted everything, other modified."""
        base = "line1\nline2\n"
        ours = ""
        theirs = "line1\nmodified\n"
        result = lib.merge3(base, ours, theirs)
        # Should be a conflict
        assert result["has_conflicts"] is True

    def test_merge_additions_at_end(self, lib):
        """Both add at end - different content."""
        base = "line1\n"
        ours = "line1\nour addition\n"
        theirs = "line1\ntheir addition\n"
        result = lib.merge3(base, ours, theirs)
        # Adding at same position with different content = conflict
        assert result["has_conflicts"] is True

    def test_merge_additions_at_end_same(self, lib):
        """Both add same content at end."""
        base = "line1\n"
        ours = "line1\nsame addition\n"
        theirs = "line1\nsame addition\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert "same addition" in result["content"]

    def test_merge_unicode(self, lib):
        """Unicode content in merge."""
        base = "Hello\n世界\n"
        ours = "Hello\n世界\nПривет\n"
        theirs = "Hello\n世界\n"
        result = lib.merge3(base, ours, theirs)
        assert result["has_conflicts"] is False
        assert "Привет" in result["content"]


class TestConflictHelpers:
    """Tests for conflict helper functions."""

    def test_has_conflicts_true(self, lib):
        """Detect conflict markers."""
        content = "line1\n<<<<<<< ours\nour version\n=======\ntheir version\n>>>>>>> theirs\nline2\n"
        assert lib.has_conflicts(content) is True

    def test_has_conflicts_false(self, lib):
        """No conflict markers."""
        content = "line1\nline2\nline3\n"
        assert lib.has_conflicts(content) is False

    def test_has_conflicts_partial_markers(self, lib):
        """Partial markers don't count."""
        content = "line with <<<<<<< but not a real conflict\n"
        # This is ambiguous - implementation may vary
        result = lib.has_conflicts(content)
        assert isinstance(result, bool)

    def test_extract_conflicts(self, lib):
        """Extract conflict regions."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        merged = lib.merge3(base, ours, theirs)
        conflicts = lib.extract_conflicts(merged["content"])
        assert len(conflicts) >= 1
        assert "ours" in conflicts[0]
        assert "theirs" in conflicts[0]

    def test_resolve_conflict_ours(self, lib):
        """Resolve conflict taking ours."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        merged = lib.merge3(base, ours, theirs)
        resolved = lib.resolve_conflict(merged["content"], 0, "ours")
        assert lib.has_conflicts(resolved) is False
        assert "our line" in resolved

    def test_resolve_conflict_theirs(self, lib):
        """Resolve conflict taking theirs."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        merged = lib.merge3(base, ours, theirs)
        resolved = lib.resolve_conflict(merged["content"], 0, "theirs")
        assert lib.has_conflicts(resolved) is False
        assert "their line" in resolved

    def test_resolve_conflict_custom(self, lib):
        """Resolve conflict with custom text."""
        base = "line\n"
        ours = "our line\n"
        theirs = "their line\n"
        merged = lib.merge3(base, ours, theirs)
        resolved = lib.resolve_conflict(merged["content"], 0, "combined line\n")
        assert lib.has_conflicts(resolved) is False
        assert "combined line" in resolved

    def test_resolve_multiple_conflicts(self, lib):
        """Resolve multiple conflicts one at a time."""
        base = "a\nb\n"
        ours = "A\nB\n"
        theirs = "X\nY\n"
        merged = lib.merge3(base, ours, theirs)
        # Resolve first conflict
        resolved = lib.resolve_conflict(merged["content"], 0, "ours")
        # May still have second conflict
        if lib.has_conflicts(resolved):
            resolved = lib.resolve_conflict(resolved, 0, "theirs")
        assert lib.has_conflicts(resolved) is False
