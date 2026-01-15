"""Tests for minigit diff command."""

import pytest
from pathlib import Path


class TestDiff:
    """Tests for showing differences."""

    def test_diff_no_changes(self, repo_with_commit):
        """diff shows nothing when no changes."""
        mg, work_dir = repo_with_commit
        result = mg.diff()
        assert result.stdout.strip() == ''

    def test_diff_unstaged_changes(self, repo_with_commit):
        """diff shows unstaged changes."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified content\n')
        result = mg.diff()
        assert 'modified content' in result.stdout
        assert '+' in result.stdout  # Added line marker

    def test_diff_staged_changes(self, repo_with_commit):
        """diff --staged shows staged changes."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified content\n')
        mg.add('file.txt')
        result = mg.diff('--staged')
        assert 'modified content' in result.stdout

    def test_diff_cached_alias(self, repo_with_commit):
        """diff --cached is alias for --staged."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified content\n')
        mg.add('file.txt')
        result = mg.run('diff', '--cached')
        assert 'modified content' in result.stdout

    def test_diff_unified_format(self, repo_with_commit):
        """diff uses unified format."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('new line\n')
        result = mg.diff()
        # Unified format has @@ markers
        assert '@@' in result.stdout
        assert '---' in result.stdout
        assert '+++' in result.stdout

    def test_diff_shows_file_header(self, repo_with_commit):
        """diff shows file path in header."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('changed\n')
        result = mg.diff()
        assert 'file.txt' in result.stdout

    def test_diff_added_lines(self, repo_with_commit):
        """diff marks added lines with +."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('hello\nnew line\n')
        result = mg.diff()
        assert '+new line' in result.stdout

    def test_diff_removed_lines(self, repo_with_commit):
        """diff marks removed lines with -."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('')
        result = mg.diff()
        assert '-hello' in result.stdout

    def test_diff_context_lines(self, repo):
        """diff shows context around changes."""
        mg, work_dir = repo
        content = '\n'.join([f'line {i}' for i in range(1, 11)]) + '\n'
        (work_dir / 'file.txt').write_text(content)
        mg.add('file.txt')
        mg.commit('Initial')

        # Modify middle line
        lines = content.split('\n')
        lines[4] = 'MODIFIED line 5'
        (work_dir / 'file.txt').write_text('\n'.join(lines))

        result = mg.diff()
        # Should have context lines around the change
        assert 'MODIFIED' in result.stdout
        assert 'line 4' in result.stdout or 'line 6' in result.stdout

    def test_diff_between_commits(self, repo_with_commit):
        """diff <commit1> <commit2> compares commits."""
        mg, work_dir = repo_with_commit

        # Get first commit SHA
        result1 = mg.log('--oneline')
        first_sha = result1.stdout.strip().split()[0]

        # Make second commit
        (work_dir / 'file.txt').write_text('modified\n')
        mg.add('file.txt')
        mg.commit('Second commit')

        # Get second SHA
        result2 = mg.log('--oneline', '-n', '1')
        second_sha = result2.stdout.strip().split()[0]

        # Diff between commits
        result = mg.diff(first_sha, second_sha)
        assert 'modified' in result.stdout

    def test_diff_single_commit(self, repo_with_commit):
        """diff <commit> compares working tree to commit."""
        mg, work_dir = repo_with_commit

        result1 = mg.log('--oneline')
        sha = result1.stdout.strip().split()[0]

        (work_dir / 'file.txt').write_text('changed\n')
        result = mg.diff(sha)
        assert 'changed' in result.stdout

    def test_diff_new_file(self, repo):
        """diff shows new untracked file after staging."""
        mg, work_dir = repo
        (work_dir / 'new.txt').write_text('new content\n')
        mg.add('new.txt')
        result = mg.diff('--staged')
        assert 'new.txt' in result.stdout
        assert 'new content' in result.stdout

    def test_diff_deleted_file(self, repo_with_commit):
        """diff shows deleted file."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').unlink()
        mg.add('-A')
        result = mg.diff('--staged')
        assert 'file.txt' in result.stdout
        assert '-hello' in result.stdout

    def test_diff_binary_file(self, repo):
        """diff handles binary files."""
        mg, work_dir = repo
        (work_dir / 'binary.bin').write_bytes(bytes(range(256)))
        mg.add('binary.bin')
        mg.commit('Add binary')

        (work_dir / 'binary.bin').write_bytes(bytes(range(255, -1, -1)))
        result = mg.diff()
        # Binary files shown differently
        assert 'binary' in result.stdout.lower() or 'Binary' in result.stdout

    def test_diff_stat(self, repo_with_commit):
        """diff --stat shows summary."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified line\n')
        result = mg.run('diff', '--stat')
        assert 'file.txt' in result.stdout
        # Stat format shows insertions/deletions
        assert '+' in result.stdout or 'insertion' in result.stdout

    def test_diff_multiple_files(self, repo):
        """diff shows changes in multiple files."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        mg.add('.')
        mg.commit('Initial')

        (work_dir / 'a.txt').write_text('AAA\n')
        (work_dir / 'b.txt').write_text('BBB\n')

        result = mg.diff()
        assert 'a.txt' in result.stdout
        assert 'b.txt' in result.stdout
        assert 'AAA' in result.stdout
        assert 'BBB' in result.stdout

    def test_diff_specific_file(self, repo_with_commit):
        """diff <path> shows changes in specific file only."""
        mg, work_dir = repo_with_commit
        (work_dir / 'other.txt').write_text('other\n')
        mg.add('other.txt')
        mg.commit('Add other')

        (work_dir / 'file.txt').write_text('modified\n')
        (work_dir / 'other.txt').write_text('also modified\n')

        result = mg.diff('--', 'file.txt')
        assert 'file.txt' in result.stdout
        assert 'other.txt' not in result.stdout
