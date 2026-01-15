"""Tests for word and character diff functionality."""

import pytest


class TestDiffWords:
    """Tests for word-based diff."""

    def test_identical_words(self, lib):
        """Identical text produces equal hunks only."""
        text = "hello world"
        result = lib.diff_words(text, text)
        ops = [h["op"] for h in result]
        assert all(op == "equal" for op in ops)

    def test_single_word_change(self, lib):
        """Single word changed."""
        old = "the quick brown fox"
        new = "the slow brown fox"
        result = lib.diff_words(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count == 1
        assert insert_count == 1

    def test_word_addition(self, lib):
        """Word added."""
        old = "hello world"
        new = "hello beautiful world"
        result = lib.diff_words(old, new)
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert insert_count >= 1

    def test_word_deletion(self, lib):
        """Word deleted."""
        old = "hello beautiful world"
        new = "hello world"
        result = lib.diff_words(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        assert delete_count >= 1

    def test_multiple_word_changes(self, lib):
        """Multiple words changed."""
        old = "one two three four five"
        new = "one TWO three FOUR five"
        result = lib.diff_words(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count == 2
        assert insert_count == 2

    def test_empty_to_words(self, lib):
        """Empty to words."""
        result = lib.diff_words("", "hello world")
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert insert_count >= 1

    def test_words_to_empty(self, lib):
        """Words to empty."""
        result = lib.diff_words("hello world", "")
        delete_count = len([h for h in result if h["op"] == "delete"])
        assert delete_count >= 1

    def test_punctuation_handling(self, lib):
        """Punctuation as separate tokens."""
        old = "hello, world!"
        new = "hello; world?"
        result = lib.diff_words(old, new)
        # Should detect punctuation changes
        assert len(result) > 0

    def test_whitespace_variations(self, lib):
        """Different whitespace amounts."""
        old = "hello  world"
        new = "hello world"
        result = lib.diff_words(old, new)
        # Should handle whitespace differences
        assert len(result) > 0

    def test_case_sensitive(self, lib):
        """Word diff is case sensitive."""
        old = "Hello World"
        new = "hello world"
        result = lib.diff_words(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count >= 1
        assert insert_count >= 1


class TestDiffChars:
    """Tests for character-based diff."""

    def test_identical_chars(self, lib):
        """Identical text produces equal hunks only."""
        text = "hello"
        result = lib.diff_chars(text, text)
        ops = [h["op"] for h in result]
        assert all(op == "equal" for op in ops)

    def test_single_char_change(self, lib):
        """Single character changed."""
        old = "hello"
        new = "hallo"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count == 1
        assert insert_count == 1

    def test_char_addition(self, lib):
        """Character added."""
        old = "helo"
        new = "hello"
        result = lib.diff_chars(old, new)
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert insert_count == 1

    def test_char_deletion(self, lib):
        """Character deleted."""
        old = "hello"
        new = "helo"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        assert delete_count == 1

    def test_multiple_char_changes(self, lib):
        """Multiple character changes."""
        old = "abcdef"
        new = "aBcDeF"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count == 3
        assert insert_count == 3

    def test_empty_to_chars(self, lib):
        """Empty to characters."""
        result = lib.diff_chars("", "hello")
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert insert_count == 1
        # The inserted content should be "hello"
        inserted = "".join(h["content"] for h in result if h["op"] == "insert")
        assert inserted == "hello"

    def test_chars_to_empty(self, lib):
        """Characters to empty."""
        result = lib.diff_chars("hello", "")
        delete_count = len([h for h in result if h["op"] == "delete"])
        assert delete_count == 1
        deleted = "".join(h["content"] for h in result if h["op"] == "delete")
        assert deleted == "hello"

    def test_unicode_chars(self, lib):
        """Unicode character handling."""
        old = "héllo"
        new = "hëllo"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count == 1
        assert insert_count == 1

    def test_emoji_chars(self, lib):
        """Emoji handling."""
        old = "hello 👋"
        new = "hello 🌍"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count >= 1
        assert insert_count >= 1

    def test_newline_chars(self, lib):
        """Newline as character."""
        old = "hello\nworld"
        new = "hello world"
        result = lib.diff_chars(old, new)
        delete_count = len([h for h in result if h["op"] == "delete"])
        insert_count = len([h for h in result if h["op"] == "insert"])
        assert delete_count >= 1
        assert insert_count >= 1

    def test_tab_chars(self, lib):
        """Tab characters."""
        old = "hello\tworld"
        new = "hello world"
        result = lib.diff_chars(old, new)
        # Should detect tab vs space difference
        assert len(result) > 0
