"""Tests for minigit show and cat-file commands."""

import pytest
from pathlib import Path
import re


class TestShow:
    """Tests for showing objects."""

    def test_show_commit(self, repo_with_commit):
        """show displays commit information."""
        mg, work_dir = repo_with_commit
        result = mg.show('HEAD')
        assert 'Initial commit' in result.stdout
        assert 'Test User' in result.stdout or 'Author' in result.stdout

    def test_show_commit_sha(self, repo_with_commit):
        """show works with commit SHA."""
        mg, work_dir = repo_with_commit

        result = mg.log('--oneline')
        sha = result.stdout.strip().split()[0]

        result = mg.show(sha)
        assert 'Initial commit' in result.stdout

    def test_show_commit_with_diff(self, repo_with_commit):
        """show displays diff for commit."""
        mg, work_dir = repo_with_commit
        result = mg.show('HEAD')
        # Should show what was added
        assert 'file.txt' in result.stdout
        assert 'hello' in result.stdout

    def test_show_file_at_commit(self, repo_with_commit):
        """show <commit>:<path> displays file content."""
        mg, work_dir = repo_with_commit
        result = mg.show('HEAD:file.txt')
        assert 'hello' in result.stdout

    def test_show_tree(self, repo_with_commit):
        """show displays tree object."""
        mg, work_dir = repo_with_commit

        # Get tree SHA from commit
        result = mg.run('cat-file', '-p', 'HEAD')
        # Parse tree SHA from commit object
        for line in result.stdout.split('\n'):
            if line.startswith('tree '):
                tree_sha = line.split()[1]
                break

        result = mg.show(tree_sha)
        assert 'file.txt' in result.stdout

    def test_show_blob(self, repo_with_commit):
        """show displays blob content."""
        mg, work_dir = repo_with_commit

        # Get blob SHA
        result = mg.run('cat-file', '-p', 'HEAD:file.txt')
        assert 'hello' in result.stdout

    def test_show_nonexistent_fails(self, repo_with_commit):
        """show fails for nonexistent object."""
        mg, work_dir = repo_with_commit
        result = mg.run('show', 'nonexistent', check=False)
        assert result.returncode != 0

    def test_show_parent(self, repo_with_commit):
        """show HEAD^ shows parent commit."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        result = mg.show('HEAD^')
        assert 'Initial commit' in result.stdout

    def test_show_file_in_subdir(self, repo_with_commit):
        """show works with files in subdirectories."""
        mg, work_dir = repo_with_commit
        subdir = work_dir / 'subdir'
        subdir.mkdir()
        (subdir / 'nested.txt').write_text('nested content\n')
        mg.add('.')
        mg.commit('Add nested')

        result = mg.show('HEAD:subdir/nested.txt')
        assert 'nested content' in result.stdout


class TestCatFile:
    """Tests for cat-file command."""

    def test_catfile_type_commit(self, repo_with_commit):
        """cat-file -t shows commit type."""
        mg, work_dir = repo_with_commit
        result = mg.cat_file('-t', 'HEAD')
        assert 'commit' in result.stdout

    def test_catfile_type_tree(self, repo_with_commit):
        """cat-file -t shows tree type."""
        mg, work_dir = repo_with_commit

        # Get tree SHA
        result = mg.cat_file('-p', 'HEAD')
        for line in result.stdout.split('\n'):
            if line.startswith('tree '):
                tree_sha = line.split()[1]
                break

        result = mg.cat_file('-t', tree_sha)
        assert 'tree' in result.stdout

    def test_catfile_type_blob(self, repo_with_commit):
        """cat-file -t shows blob type."""
        mg, work_dir = repo_with_commit

        # Get blob SHA from tree
        result = mg.cat_file('-p', 'HEAD^{tree}')
        # Parse blob SHA from tree
        for line in result.stdout.split('\n'):
            if 'blob' in line and 'file.txt' in line:
                blob_sha = line.split()[2]
                break

        result = mg.cat_file('-t', blob_sha)
        assert 'blob' in result.stdout

    def test_catfile_size(self, repo_with_commit):
        """cat-file -s shows object size."""
        mg, work_dir = repo_with_commit
        result = mg.cat_file('-s', 'HEAD')
        # Size should be a number
        assert result.stdout.strip().isdigit()

    def test_catfile_pretty_commit(self, repo_with_commit):
        """cat-file -p pretty-prints commit."""
        mg, work_dir = repo_with_commit
        result = mg.cat_file('-p', 'HEAD')
        assert 'tree' in result.stdout
        assert 'author' in result.stdout
        assert 'Initial commit' in result.stdout

    def test_catfile_pretty_tree(self, repo_with_commit):
        """cat-file -p pretty-prints tree."""
        mg, work_dir = repo_with_commit
        result = mg.cat_file('-p', 'HEAD^{tree}')
        # Tree format: mode type sha name
        assert 'blob' in result.stdout
        assert 'file.txt' in result.stdout

    def test_catfile_pretty_blob(self, repo_with_commit):
        """cat-file -p shows blob content."""
        mg, work_dir = repo_with_commit
        result = mg.cat_file('-p', 'HEAD:file.txt')
        assert 'hello' in result.stdout

    def test_catfile_raw_blob(self, repo_with_commit):
        """cat-file blob <sha> shows raw content."""
        mg, work_dir = repo_with_commit

        # Get blob SHA
        result = mg.cat_file('-p', 'HEAD^{tree}')
        for line in result.stdout.split('\n'):
            if 'blob' in line and 'file.txt' in line:
                blob_sha = line.split()[2]
                break

        result = mg.run('cat-file', 'blob', blob_sha)
        assert 'hello' in result.stdout

    def test_catfile_nonexistent_fails(self, repo_with_commit):
        """cat-file fails for nonexistent object."""
        mg, work_dir = repo_with_commit
        result = mg.run('cat-file', '-t', 'deadbeef' * 5, check=False)
        assert result.returncode != 0

    def test_catfile_abbreviated_sha(self, repo_with_commit):
        """cat-file works with abbreviated SHA."""
        mg, work_dir = repo_with_commit

        result = mg.log('--oneline')
        short_sha = result.stdout.strip().split()[0]

        result = mg.cat_file('-t', short_sha)
        assert 'commit' in result.stdout
