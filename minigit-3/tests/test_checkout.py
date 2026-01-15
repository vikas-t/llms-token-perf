"""Tests for minigit checkout command."""

import pytest
from pathlib import Path


class TestCheckout:
    """Tests for switching branches and restoring files."""

    def test_checkout_branch(self, repo_with_commit):
        """checkout switches to existing branch."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        result = mg.checkout('feature')
        assert result.returncode == 0

        # HEAD should point to feature
        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        assert 'refs/heads/feature' in head

    def test_checkout_updates_head(self, repo_with_commit):
        """checkout updates HEAD to new branch."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        mg.checkout('feature')

        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        assert head == 'ref: refs/heads/feature'

    def test_checkout_create_branch(self, repo_with_commit):
        """checkout -b creates and switches to new branch."""
        mg, work_dir = repo_with_commit
        result = mg.checkout('-b', 'new-branch')
        assert result.returncode == 0

        # Branch should exist
        assert (work_dir / '.minigit' / 'refs' / 'heads' / 'new-branch').is_file()

        # HEAD should point to it
        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        assert 'refs/heads/new-branch' in head

    def test_checkout_updates_working_tree(self, repo_with_commit):
        """checkout updates working tree to match branch."""
        mg, work_dir = repo_with_commit

        # Create branch with different content
        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature content\n')
        mg.add('feature.txt')
        mg.commit('Add feature file')

        # Switch back to main
        mg.checkout('main')
        assert not (work_dir / 'feature.txt').exists()

        # Switch to feature
        mg.checkout('feature')
        assert (work_dir / 'feature.txt').exists()
        assert (work_dir / 'feature.txt').read_text() == 'feature content\n'

    def test_checkout_file_from_index(self, repo_with_commit):
        """checkout -- <file> restores file from index."""
        mg, work_dir = repo_with_commit
        original = (work_dir / 'file.txt').read_text()

        # Modify without staging
        (work_dir / 'file.txt').write_text('modified\n')
        assert (work_dir / 'file.txt').read_text() == 'modified\n'

        # Restore
        mg.checkout('--', 'file.txt')
        assert (work_dir / 'file.txt').read_text() == original

    def test_checkout_file_from_commit(self, repo_with_commit):
        """checkout <commit> -- <file> restores file from commit."""
        mg, work_dir = repo_with_commit

        # Get first commit SHA
        result = mg.log('--oneline')
        first_sha = result.stdout.strip().split()[0]

        # Make changes and commit
        (work_dir / 'file.txt').write_text('version 2\n')
        mg.add('file.txt')
        mg.commit('Second version')

        # Restore from first commit
        mg.checkout(first_sha, '--', 'file.txt')
        assert (work_dir / 'file.txt').read_text() == 'hello\n'

    def test_checkout_nonexistent_branch_fails(self, repo_with_commit):
        """checkout fails for nonexistent branch."""
        mg, work_dir = repo_with_commit
        result = mg.run('checkout', 'nonexistent', check=False)
        assert result.returncode != 0

    def test_checkout_with_uncommitted_changes_fails(self, repo_with_commit):
        """checkout fails if uncommitted changes would be overwritten."""
        mg, work_dir = repo_with_commit

        # Create feature branch with different file content
        mg.checkout('-b', 'feature')
        (work_dir / 'file.txt').write_text('feature version\n')
        mg.add('file.txt')
        mg.commit('Feature changes')

        # Go back to main
        mg.checkout('main')

        # Modify file
        (work_dir / 'file.txt').write_text('local changes\n')

        # Try to checkout feature - should fail
        result = mg.run('checkout', 'feature', check=False)
        assert result.returncode != 0

    def test_checkout_detached_head(self, repo_with_commit):
        """checkout <sha> creates detached HEAD."""
        mg, work_dir = repo_with_commit

        # Make another commit
        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        # Get first commit SHA
        result = mg.log('--oneline')
        first_sha = result.stdout.strip().split('\n')[-1].split()[0]

        # Checkout the SHA
        mg.checkout(first_sha)

        # HEAD should be detached (direct SHA, not ref)
        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        assert not head.startswith('ref:')

    def test_checkout_b_existing_fails(self, repo_with_commit):
        """checkout -b fails if branch already exists."""
        mg, work_dir = repo_with_commit
        mg.branch('existing')
        result = mg.run('checkout', '-b', 'existing', check=False)
        assert result.returncode != 0

    def test_checkout_removes_files(self, repo_with_commit):
        """checkout removes files not in target branch."""
        mg, work_dir = repo_with_commit

        # Add file on main
        (work_dir / 'main-only.txt').write_text('main\n')
        mg.add('main-only.txt')
        mg.commit('Add main-only file')

        # Create feature branch from initial commit
        result = mg.log('--oneline')
        first_sha = result.stdout.strip().split('\n')[-1].split()[0]
        mg.checkout('-b', 'feature', first_sha)

        # File should not exist on feature
        assert not (work_dir / 'main-only.txt').exists()

        # Back to main - file should reappear
        mg.checkout('main')
        assert (work_dir / 'main-only.txt').exists()

    def test_checkout_multiple_files(self, repo_with_commit):
        """checkout can restore multiple files."""
        mg, work_dir = repo_with_commit
        (work_dir / 'a.txt').write_text('a\n')
        (work_dir / 'b.txt').write_text('b\n')
        mg.add('.')
        mg.commit('Add files')

        # Modify both
        (work_dir / 'a.txt').write_text('modified a\n')
        (work_dir / 'b.txt').write_text('modified b\n')

        # Restore both
        mg.checkout('--', 'a.txt', 'b.txt')
        assert (work_dir / 'a.txt').read_text() == 'a\n'
        assert (work_dir / 'b.txt').read_text() == 'b\n'

    def test_checkout_preserves_untracked(self, repo_with_commit):
        """checkout preserves untracked files."""
        mg, work_dir = repo_with_commit
        mg.checkout('-b', 'feature')

        (work_dir / 'untracked.txt').write_text('untracked\n')
        mg.checkout('main')

        # Untracked file should still exist
        assert (work_dir / 'untracked.txt').exists()

    def test_checkout_subdir_file(self, repo_with_commit):
        """checkout can restore file in subdirectory."""
        mg, work_dir = repo_with_commit
        subdir = work_dir / 'subdir'
        subdir.mkdir()
        (subdir / 'file.txt').write_text('original\n')
        mg.add('.')
        mg.commit('Add subdir file')

        (subdir / 'file.txt').write_text('modified\n')
        mg.checkout('--', 'subdir/file.txt')
        assert (subdir / 'file.txt').read_text() == 'original\n'
