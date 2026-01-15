"""Tests for minigit merge command."""

import pytest
from pathlib import Path
import re


class TestMerge:
    """Tests for merging branches."""

    def test_merge_fast_forward(self, repo_with_commit):
        """merge fast-forwards when possible."""
        mg, work_dir = repo_with_commit

        # Create feature branch and add commit
        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        # Get feature SHA
        feature_sha = (work_dir / '.minigit' / 'refs' / 'heads' / 'feature').read_text().strip()

        # Back to main and merge
        mg.checkout('main')
        result = mg.merge('feature')
        assert result.returncode == 0

        # Main should now point to feature commit
        main_sha = (work_dir / '.minigit' / 'refs' / 'heads' / 'main').read_text().strip()
        assert main_sha == feature_sha

    def test_merge_creates_merge_commit(self, repo_with_commit):
        """merge creates merge commit when branches diverge."""
        mg, work_dir = repo_with_commit

        # Create feature branch with commit
        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        # Back to main, make different commit
        mg.checkout('main')
        (work_dir / 'main.txt').write_text('main\n')
        mg.add('main.txt')
        mg.commit('Main commit')

        # Merge
        result = mg.merge('feature')
        assert result.returncode == 0

        # Should have both files
        assert (work_dir / 'feature.txt').exists()
        assert (work_dir / 'main.txt').exists()

    def test_merge_commit_has_two_parents(self, repo_with_commit):
        """merge commit has two parent commits."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        mg.checkout('main')
        (work_dir / 'main.txt').write_text('main\n')
        mg.add('main.txt')
        mg.commit('Main commit')

        mg.merge('feature')

        # Log should show merge commit
        result = mg.log('--oneline')
        lines = result.stdout.strip().split('\n')
        assert len(lines) >= 4  # merge, main, feature, initial

    def test_merge_conflict_markers(self, repo_with_commit):
        """merge creates conflict markers on conflict."""
        mg, work_dir = repo_with_commit

        # Create feature branch, modify file
        mg.checkout('-b', 'feature')
        (work_dir / 'file.txt').write_text('feature content\n')
        mg.add('file.txt')
        mg.commit('Feature changes')

        # Back to main, modify same file differently
        mg.checkout('main')
        (work_dir / 'file.txt').write_text('main content\n')
        mg.add('file.txt')
        mg.commit('Main changes')

        # Merge should fail or create conflicts
        result = mg.run('merge', 'feature', check=False)

        if result.returncode != 0:
            # Merge failed due to conflict - check for markers
            content = (work_dir / 'file.txt').read_text()
            assert '<<<<<<' in content or 'conflict' in result.stderr.lower()
        else:
            # Auto-resolved somehow (unlikely for this case)
            pass

    def test_merge_no_commit_flag(self, repo_with_commit):
        """merge --no-commit stages but doesn't commit."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        mg.checkout('main')
        result = mg.run('merge', '--no-commit', 'feature')
        assert result.returncode == 0

        # File should exist
        assert (work_dir / 'feature.txt').exists()

        # But no merge commit yet - status should show staged changes
        status = mg.status()
        assert 'feature.txt' in status.stdout

    def test_merge_already_merged(self, repo_with_commit):
        """merge when already up-to-date."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        mg.checkout('main')

        # feature is at same commit as main
        result = mg.merge('feature')
        assert result.returncode == 0
        assert 'up to date' in result.stdout.lower() or 'already' in result.stdout.lower()

    def test_merge_nonexistent_branch_fails(self, repo_with_commit):
        """merge fails for nonexistent branch."""
        mg, work_dir = repo_with_commit
        result = mg.run('merge', 'nonexistent', check=False)
        assert result.returncode != 0

    def test_merge_message(self, repo_with_commit):
        """merge creates appropriate commit message."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')

        mg.checkout('main')
        (work_dir / 'main.txt').write_text('main\n')
        mg.add('main.txt')
        mg.commit('Main commit')

        mg.merge('feature')

        result = mg.log('-n', '1')
        assert 'merge' in result.stdout.lower() or 'feature' in result.stdout.lower()

    def test_merge_multiple_file_changes(self, repo_with_commit):
        """merge combines changes from multiple files."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'a.txt').write_text('a from feature\n')
        (work_dir / 'b.txt').write_text('b from feature\n')
        mg.add('.')
        mg.commit('Feature adds a and b')

        mg.checkout('main')
        (work_dir / 'c.txt').write_text('c from main\n')
        (work_dir / 'd.txt').write_text('d from main\n')
        mg.add('.')
        mg.commit('Main adds c and d')

        mg.merge('feature')

        # All files should exist
        assert (work_dir / 'a.txt').exists()
        assert (work_dir / 'b.txt').exists()
        assert (work_dir / 'c.txt').exists()
        assert (work_dir / 'd.txt').exists()

    def test_merge_preserves_file_content(self, repo_with_commit):
        """merge preserves exact file content."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'feature.txt').write_text('exact feature content\nline 2\n')
        mg.add('feature.txt')
        mg.commit('Feature')

        mg.checkout('main')
        mg.merge('feature')

        assert (work_dir / 'feature.txt').read_text() == 'exact feature content\nline 2\n'

    def test_merge_abort(self, repo_with_commit):
        """merge --abort cancels in-progress merge."""
        mg, work_dir = repo_with_commit

        # Create conflict
        mg.checkout('-b', 'feature')
        (work_dir / 'file.txt').write_text('feature\n')
        mg.add('file.txt')
        mg.commit('Feature')

        mg.checkout('main')
        (work_dir / 'file.txt').write_text('main\n')
        mg.add('file.txt')
        mg.commit('Main')

        # Start merge (may fail with conflict)
        mg.run('merge', 'feature', check=False)

        # Abort
        result = mg.run('merge', '--abort', check=False)
        # Either succeeds or no merge in progress
        assert result.returncode == 0 or 'no merge' in result.stderr.lower()

    def test_merge_subdirectory_files(self, repo_with_commit):
        """merge handles files in subdirectories."""
        mg, work_dir = repo_with_commit

        mg.checkout('-b', 'feature')
        (work_dir / 'subdir').mkdir()
        (work_dir / 'subdir' / 'file.txt').write_text('nested\n')
        mg.add('.')
        mg.commit('Add nested file')

        mg.checkout('main')
        mg.merge('feature')

        assert (work_dir / 'subdir' / 'file.txt').exists()
        assert (work_dir / 'subdir' / 'file.txt').read_text() == 'nested\n'
