"""Tests for minigit log command."""

import pytest
from pathlib import Path
import re


class TestLog:
    """Tests for showing commit history."""

    def test_log_single_commit(self, repo_with_commit):
        """log shows single commit."""
        mg, work_dir = repo_with_commit
        result = mg.log()
        assert 'Initial commit' in result.stdout

    def test_log_shows_sha(self, repo_with_commit):
        """log shows commit SHA."""
        mg, work_dir = repo_with_commit
        result = mg.log()
        assert re.search(r'[0-9a-f]{7,40}', result.stdout)

    def test_log_shows_author(self, repo_with_commit):
        """log shows author information."""
        mg, work_dir = repo_with_commit
        result = mg.log()
        assert 'Test User' in result.stdout or 'Author' in result.stdout

    def test_log_shows_date(self, repo_with_commit):
        """log shows commit date."""
        mg, work_dir = repo_with_commit
        result = mg.log()
        # Date might be in various formats
        assert 'Date' in result.stdout or '2024' in result.stdout

    def test_log_multiple_commits(self, repo_with_commit):
        """log shows multiple commits in order."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        (work_dir / 'file3.txt').write_text('third\n')
        mg.add('file3.txt')
        mg.commit('Third commit')

        result = mg.log()
        lines = result.stdout

        # Third should appear before Second, which should appear before Initial
        third_pos = lines.find('Third commit')
        second_pos = lines.find('Second commit')
        initial_pos = lines.find('Initial commit')

        assert third_pos < second_pos < initial_pos

    def test_log_oneline(self, repo_with_commit):
        """log --oneline shows abbreviated format."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        result = mg.log('--oneline')
        lines = result.stdout.strip().split('\n')
        assert len(lines) == 2
        # Each line should have SHA + message
        for line in lines:
            assert re.match(r'^[0-9a-f]{7}', line)

    def test_log_limit_n(self, repo_with_commit):
        """log -n N limits output."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        (work_dir / 'file3.txt').write_text('third\n')
        mg.add('file3.txt')
        mg.commit('Third commit')

        result = mg.log('-n', '2', '--oneline')
        lines = result.stdout.strip().split('\n')
        assert len(lines) == 2
        assert 'Initial commit' not in result.stdout

    def test_log_from_ref(self, repo_with_commit):
        """log <ref> shows history from specific ref."""
        mg, work_dir = repo_with_commit

        # Get the current commit SHA
        result1 = mg.log('--oneline')
        first_sha = result1.stdout.strip().split()[0]

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        # Log from first commit
        result = mg.log(first_sha)
        assert 'Initial commit' in result.stdout
        assert 'Second commit' not in result.stdout

    def test_log_empty_repo(self, repo):
        """log on repo with no commits."""
        mg, work_dir = repo
        result = mg.run('log', check=False)
        # May return error or empty output
        assert result.returncode != 0 or result.stdout.strip() == ''

    def test_log_shows_full_message(self, repo):
        """log shows full commit message."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')

        message = """This is a multi-line commit message

With a body that has more details
and multiple lines."""
        mg.run('commit', '-m', message)

        result = mg.log()
        assert 'multi-line' in result.stdout
        assert 'body' in result.stdout

    def test_log_graph(self, repo_with_commit):
        """log --graph shows ASCII graph."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        result = mg.log('--graph', '--oneline')
        # Graph format includes * or | characters
        assert '*' in result.stdout or '|' in result.stdout

    def test_log_after_branch_merge(self, repo_with_commit):
        """log shows merge commit with multiple parents."""
        mg, work_dir = repo_with_commit

        # Create branch
        mg.branch('feature')
        mg.checkout('feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        # Back to main and merge
        mg.checkout('main')
        (work_dir / 'main.txt').write_text('main\n')
        mg.add('main.txt')
        mg.commit('Main commit')

        mg.merge('feature')

        result = mg.log('--oneline')
        # Should see merge, main, feature, and initial commits
        lines = result.stdout.strip().split('\n')
        assert len(lines) >= 4

    def test_log_with_stat(self, repo_with_commit):
        """log --stat shows file changes."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second line\n')
        mg.add('file2.txt')
        mg.commit('Add file2')

        result = mg.run('log', '--stat')
        assert 'file2.txt' in result.stdout
