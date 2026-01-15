"""Tests for minigit status command."""

import pytest
from pathlib import Path


class TestStatus:
    """Tests for showing working tree status."""

    def test_status_clean_repo(self, repo_with_commit):
        """status shows clean working tree."""
        mg, work_dir = repo_with_commit
        result = mg.status()
        assert 'clean' in result.stdout.lower() or 'nothing to commit' in result.stdout.lower()

    def test_status_untracked_file(self, repo):
        """status shows untracked files."""
        mg, work_dir = repo
        (work_dir / 'untracked.txt').write_text('new\n')
        result = mg.status()
        assert 'untracked.txt' in result.stdout
        assert 'untracked' in result.stdout.lower()

    def test_status_staged_new_file(self, repo):
        """status shows staged new files."""
        mg, work_dir = repo
        (work_dir / 'new.txt').write_text('new\n')
        mg.add('new.txt')
        result = mg.status()
        assert 'new.txt' in result.stdout
        assert 'staged' in result.stdout.lower() or 'to be committed' in result.stdout.lower()

    def test_status_staged_modified(self, repo_with_commit):
        """status shows staged modifications."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified\n')
        mg.add('file.txt')
        result = mg.status()
        assert 'file.txt' in result.stdout
        assert 'modified' in result.stdout.lower()

    def test_status_unstaged_modified(self, repo_with_commit):
        """status shows unstaged modifications."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').write_text('modified\n')
        result = mg.status()
        assert 'file.txt' in result.stdout
        assert 'modified' in result.stdout.lower() or 'not staged' in result.stdout.lower()

    def test_status_deleted_file(self, repo_with_commit):
        """status shows deleted files."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').unlink()
        result = mg.status()
        assert 'file.txt' in result.stdout
        assert 'deleted' in result.stdout.lower()

    def test_status_staged_deleted(self, repo_with_commit):
        """status shows staged deletions."""
        mg, work_dir = repo_with_commit
        (work_dir / 'file.txt').unlink()
        mg.add('-A')
        result = mg.status()
        assert 'file.txt' in result.stdout
        assert 'deleted' in result.stdout.lower()

    def test_status_short_format(self, repo):
        """status --short shows abbreviated output."""
        mg, work_dir = repo
        (work_dir / 'new.txt').write_text('new\n')
        mg.add('new.txt')
        (work_dir / 'untracked.txt').write_text('x\n')
        result = mg.status('--short')
        # Short format uses status codes like A, M, ?, etc.
        assert 'A' in result.stdout or 'new.txt' in result.stdout

    def test_status_porcelain(self, repo):
        """status --porcelain shows machine-readable output."""
        mg, work_dir = repo
        (work_dir / 'new.txt').write_text('new\n')
        mg.add('new.txt')
        result = mg.status('--porcelain')
        # Porcelain format: XY filename
        assert 'new.txt' in result.stdout

    def test_status_multiple_changes(self, repo_with_commit):
        """status shows multiple types of changes."""
        mg, work_dir = repo_with_commit

        # Staged new file
        (work_dir / 'staged_new.txt').write_text('new\n')
        mg.add('staged_new.txt')

        # Unstaged modification
        (work_dir / 'file.txt').write_text('modified\n')

        # Untracked file
        (work_dir / 'untracked.txt').write_text('x\n')

        result = mg.status()
        assert 'staged_new.txt' in result.stdout
        assert 'file.txt' in result.stdout
        assert 'untracked.txt' in result.stdout

    def test_status_on_branch(self, repo_with_commit):
        """status shows current branch."""
        mg, work_dir = repo_with_commit
        result = mg.status()
        assert 'main' in result.stdout or 'branch' in result.stdout.lower()

    def test_status_empty_repo(self, repo):
        """status works on empty repo."""
        mg, work_dir = repo
        result = mg.status()
        assert result.returncode == 0

    def test_status_in_subdirectory(self, repo_with_commit):
        """status works from subdirectory."""
        mg, work_dir = repo_with_commit
        subdir = work_dir / 'subdir'
        subdir.mkdir()
        (subdir / 'new.txt').write_text('new\n')

        # Run from subdirectory
        mg.work_dir = subdir
        result = mg.status()
        mg.work_dir = work_dir

        assert result.returncode == 0

    def test_status_renamed_file(self, repo_with_commit):
        """status detects renamed files."""
        mg, work_dir = repo_with_commit

        # Rename by delete + create with same content
        content = (work_dir / 'file.txt').read_text()
        (work_dir / 'file.txt').unlink()
        (work_dir / 'renamed.txt').write_text(content)
        mg.add('-A')

        result = mg.status()
        # May show as delete + add or as rename
        assert 'file.txt' in result.stdout or 'renamed.txt' in result.stdout
