"""Tests for minigit branch command."""

import pytest
from pathlib import Path


class TestBranch:
    """Tests for branch management."""

    def test_branch_list_main(self, repo_with_commit):
        """branch lists main branch."""
        mg, work_dir = repo_with_commit
        result = mg.branch()
        assert 'main' in result.stdout

    def test_branch_current_marker(self, repo_with_commit):
        """branch marks current branch with *."""
        mg, work_dir = repo_with_commit
        result = mg.branch()
        assert '* main' in result.stdout or '*main' in result.stdout

    def test_branch_create(self, repo_with_commit):
        """branch <name> creates new branch."""
        mg, work_dir = repo_with_commit
        result = mg.branch('feature')
        assert result.returncode == 0

        result = mg.branch()
        assert 'feature' in result.stdout

    def test_branch_create_writes_ref(self, repo_with_commit):
        """branch creates ref file."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')

        ref_path = work_dir / '.minigit' / 'refs' / 'heads' / 'feature'
        assert ref_path.is_file()

    def test_branch_create_same_sha(self, repo_with_commit):
        """new branch points to current commit."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')

        main_sha = (work_dir / '.minigit' / 'refs' / 'heads' / 'main').read_text().strip()
        feature_sha = (work_dir / '.minigit' / 'refs' / 'heads' / 'feature').read_text().strip()
        assert main_sha == feature_sha

    def test_branch_delete(self, repo_with_commit):
        """branch -d deletes branch."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        result = mg.branch('-d', 'feature')
        assert result.returncode == 0

        result = mg.branch()
        assert 'feature' not in result.stdout

    def test_branch_delete_removes_ref(self, repo_with_commit):
        """branch -d removes ref file."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        mg.branch('-d', 'feature')

        ref_path = work_dir / '.minigit' / 'refs' / 'heads' / 'feature'
        assert not ref_path.exists()

    def test_branch_delete_current_fails(self, repo_with_commit):
        """branch -d fails on current branch."""
        mg, work_dir = repo_with_commit
        result = mg.run('branch', '-d', 'main', check=False)
        assert result.returncode != 0

    def test_branch_delete_nonexistent_fails(self, repo_with_commit):
        """branch -d fails for nonexistent branch."""
        mg, work_dir = repo_with_commit
        result = mg.run('branch', '-d', 'nonexistent', check=False)
        assert result.returncode != 0

    def test_branch_force_delete(self, repo_with_commit):
        """branch -D force deletes unmerged branch."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        mg.checkout('feature')
        (work_dir / 'feature.txt').write_text('feature\n')
        mg.add('feature.txt')
        mg.commit('Feature commit')
        mg.checkout('main')

        # -D should work even if unmerged
        result = mg.run('branch', '-D', 'feature')
        assert result.returncode == 0

    def test_branch_rename(self, repo_with_commit):
        """branch -m renames branch."""
        mg, work_dir = repo_with_commit
        mg.branch('old-name')
        result = mg.branch('-m', 'old-name', 'new-name')
        assert result.returncode == 0

        result = mg.branch()
        assert 'new-name' in result.stdout
        assert 'old-name' not in result.stdout

    def test_branch_verbose(self, repo_with_commit):
        """branch -v shows commit info."""
        mg, work_dir = repo_with_commit
        result = mg.branch('-v')
        assert 'main' in result.stdout
        assert 'Initial commit' in result.stdout or result.stdout.count('main') > 0

    def test_branch_list_multiple(self, repo_with_commit):
        """branch lists multiple branches."""
        mg, work_dir = repo_with_commit
        mg.branch('alpha')
        mg.branch('beta')
        mg.branch('gamma')

        result = mg.branch()
        assert 'alpha' in result.stdout
        assert 'beta' in result.stdout
        assert 'gamma' in result.stdout
        assert 'main' in result.stdout

    def test_branch_already_exists_fails(self, repo_with_commit):
        """branch fails if name already exists."""
        mg, work_dir = repo_with_commit
        mg.branch('feature')
        result = mg.run('branch', 'feature', check=False)
        assert result.returncode != 0

    def test_branch_from_specific_commit(self, repo_with_commit):
        """branch <name> <commit> creates branch at commit."""
        mg, work_dir = repo_with_commit

        # Make more commits
        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second')

        # Get first commit SHA
        result = mg.log('--oneline')
        lines = result.stdout.strip().split('\n')
        first_sha = lines[-1].split()[0]

        # Create branch at first commit
        mg.branch('old-branch', first_sha)

        # Verify it points to first commit
        branch_sha = (work_dir / '.minigit' / 'refs' / 'heads' / 'old-branch').read_text().strip()
        assert branch_sha.startswith(first_sha) or first_sha.startswith(branch_sha[:7])

    def test_branch_invalid_name_fails(self, repo_with_commit):
        """branch fails with invalid name."""
        mg, work_dir = repo_with_commit
        result = mg.run('branch', '..invalid', check=False)
        assert result.returncode != 0
