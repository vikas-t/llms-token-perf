"""Tests for minigit commit command."""

import pytest
from pathlib import Path
import re


class TestCommit:
    """Tests for creating commits."""

    def test_commit_creates_commit_object(self, repo):
        """commit creates a commit object."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        result = mg.commit('Initial commit')
        assert result.returncode == 0

    def test_commit_outputs_sha(self, repo):
        """commit outputs the commit SHA."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        result = mg.commit('Initial commit')
        # Should contain a SHA (40 hex chars or abbreviated)
        assert re.search(r'[0-9a-f]{7,40}', result.stdout)

    def test_commit_updates_head(self, repo):
        """commit updates HEAD to point to new commit."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Initial commit')

        # HEAD should resolve to a SHA
        head_ref = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        if head_ref.startswith('ref:'):
            ref_path = head_ref.split(': ')[1]
            sha = (work_dir / '.minigit' / ref_path).read_text().strip()
        else:
            sha = head_ref
        assert re.match(r'^[0-9a-f]{40}$', sha)

    def test_commit_updates_branch_ref(self, repo):
        """commit updates the current branch ref."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Initial commit')

        main_ref = work_dir / '.minigit' / 'refs' / 'heads' / 'main'
        assert main_ref.is_file()
        sha = main_ref.read_text().strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

    def test_commit_with_parent(self, repo_with_commit):
        """second commit has parent pointing to first."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        # Verify through log
        result = mg.log()
        assert 'Second commit' in result.stdout
        assert 'Initial commit' in result.stdout

    def test_commit_message_stored(self, repo):
        """commit message is stored in commit object."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('My test message')

        result = mg.log()
        assert 'My test message' in result.stdout

    def test_commit_author_info(self, repo):
        """commit stores author information."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Test commit')

        result = mg.log()
        assert 'Test User' in result.stdout or 'test@example.com' in result.stdout

    def test_commit_nothing_staged_fails(self, repo):
        """commit fails when nothing is staged."""
        mg, work_dir = repo
        result = mg.run('commit', '-m', 'empty', check=False)
        assert result.returncode != 0

    def test_commit_no_changes_fails(self, repo_with_commit):
        """commit fails when no changes since last commit."""
        mg, work_dir = repo_with_commit
        result = mg.run('commit', '-m', 'no changes', check=False)
        assert result.returncode != 0

    def test_commit_requires_message(self, repo):
        """commit requires -m message."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        result = mg.run('commit', check=False)
        assert result.returncode != 0

    def test_commit_a_flag(self, repo_with_commit):
        """commit -a auto-stages modified tracked files."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified\n')
        result = mg.run('commit', '-a', '-m', 'Auto staged')
        assert result.returncode == 0

    def test_commit_creates_tree_object(self, repo):
        """commit creates a tree object."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Test')

        # Should have multiple objects (blob + tree + commit)
        objects_dir = work_dir / '.minigit' / 'objects'
        object_files = list(objects_dir.rglob('*'))
        object_files = [f for f in object_files if f.is_file()]
        assert len(object_files) >= 3  # blob, tree, commit

    def test_commit_amend(self, repo_with_commit):
        """commit --amend modifies the last commit."""
        mg, work_dir = repo_with_commit

        # Get original SHA
        result1 = mg.log('--oneline')
        original_sha = result1.stdout.strip().split()[0]

        # Amend
        (work_dir / 'extra.txt').write_text('extra\n')
        mg.add('extra.txt')
        mg.run('commit', '--amend', '-m', 'Amended commit')

        # SHA should change
        result2 = mg.log('--oneline')
        new_sha = result2.stdout.strip().split()[0]
        assert original_sha != new_sha
        assert 'Amended commit' in result2.stdout

    def test_commit_multiple_files(self, repo):
        """commit with multiple staged files."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        (work_dir / 'c.txt').write_text('ccc\n')
        mg.add('.')
        result = mg.commit('Multiple files')
        assert result.returncode == 0

    def test_commit_nested_directories(self, repo):
        """commit with nested directory structure."""
        mg, work_dir = repo
        (work_dir / 'src').mkdir()
        (work_dir / 'src' / 'lib').mkdir()
        (work_dir / 'src' / 'main.py').write_text('main\n')
        (work_dir / 'src' / 'lib' / 'util.py').write_text('util\n')
        mg.add('.')
        result = mg.commit('Nested structure')
        assert result.returncode == 0
