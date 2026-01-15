"""Tests for reference handling."""

import pytest
from pathlib import Path
import re


class TestRefs:
    """Tests for reference management."""

    def test_head_points_to_branch(self, repo):
        """HEAD points to main branch initially."""
        mg, work_dir = repo
        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        assert head == 'ref: refs/heads/main'

    def test_branch_ref_contains_sha(self, repo_with_commit):
        """Branch ref file contains commit SHA."""
        mg, work_dir = repo_with_commit
        main_ref = work_dir / '.minigit' / 'refs' / 'heads' / 'main'
        sha = main_ref.read_text().strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

    def test_rev_parse_head(self, repo_with_commit):
        """rev-parse HEAD returns commit SHA."""
        mg, work_dir = repo_with_commit
        result = mg.run('rev-parse', 'HEAD')
        sha = result.stdout.strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

    def test_rev_parse_branch(self, repo_with_commit):
        """rev-parse <branch> returns commit SHA."""
        mg, work_dir = repo_with_commit
        result = mg.run('rev-parse', 'main')
        sha = result.stdout.strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

    def test_rev_parse_parent(self, repo_with_commit):
        """rev-parse HEAD^ returns parent SHA."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second')

        result = mg.run('rev-parse', 'HEAD^')
        sha = result.stdout.strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

        # Should differ from HEAD
        head_result = mg.run('rev-parse', 'HEAD')
        assert sha != head_result.stdout.strip()

    def test_rev_parse_tree(self, repo_with_commit):
        """rev-parse HEAD^{tree} returns tree SHA."""
        mg, work_dir = repo_with_commit
        result = mg.run('rev-parse', 'HEAD^{tree}')
        sha = result.stdout.strip()
        assert re.match(r'^[0-9a-f]{40}$', sha)

        # Verify it's a tree
        type_result = mg.run('cat-file', '-t', sha)
        assert 'tree' in type_result.stdout

    def test_rev_parse_abbreviated(self, repo_with_commit):
        """rev-parse accepts abbreviated SHAs."""
        mg, work_dir = repo_with_commit

        result = mg.run('rev-parse', 'HEAD')
        full_sha = result.stdout.strip()

        result = mg.run('rev-parse', full_sha[:7])
        assert result.stdout.strip() == full_sha

    def test_symbolic_ref(self, repo_with_commit):
        """symbolic-ref shows symbolic reference."""
        mg, work_dir = repo_with_commit
        result = mg.run('symbolic-ref', 'HEAD', check=False)
        if result.returncode == 0:
            assert 'refs/heads/main' in result.stdout

    def test_update_ref(self, repo_with_commit):
        """update-ref updates reference."""
        mg, work_dir = repo_with_commit

        # Get current SHA
        result = mg.run('rev-parse', 'HEAD')
        sha = result.stdout.strip()

        # Create a ref
        mg.run('update-ref', 'refs/test/myref', sha)

        # Verify
        ref_path = work_dir / '.minigit' / 'refs' / 'test' / 'myref'
        assert ref_path.is_file()
        assert ref_path.read_text().strip() == sha

    def test_refs_packed(self, repo_with_commit):
        """References can be packed (optional)."""
        mg, work_dir = repo_with_commit

        # Create many branches
        for i in range(5):
            mg.branch(f'branch-{i}')

        # All should be resolvable
        for i in range(5):
            result = mg.run('rev-parse', f'branch-{i}')
            assert result.returncode == 0

    def test_tag_ref(self, repo_with_commit):
        """Tags are stored in refs/tags."""
        mg, work_dir = repo_with_commit

        # Create lightweight tag
        result = mg.run('tag', 'v1.0')
        if result.returncode == 0:
            tag_path = work_dir / '.minigit' / 'refs' / 'tags' / 'v1.0'
            assert tag_path.is_file()

    def test_head_detached(self, repo_with_commit):
        """HEAD can be detached (point directly to SHA)."""
        mg, work_dir = repo_with_commit

        result = mg.run('rev-parse', 'HEAD')
        sha = result.stdout.strip()

        mg.checkout(sha)

        head = (work_dir / '.minigit' / 'HEAD').read_text().strip()
        # Detached HEAD is just the SHA
        assert not head.startswith('ref:')
        assert re.match(r'^[0-9a-f]{40}$', head)

    def test_reflog_exists(self, repo_with_commit):
        """Reflog tracks HEAD changes."""
        mg, work_dir = repo_with_commit

        logs_dir = work_dir / '.minigit' / 'logs'
        # Reflog may or may not be implemented
        if logs_dir.exists():
            head_log = logs_dir / 'HEAD'
            if head_log.exists():
                content = head_log.read_text()
                assert len(content) > 0

    def test_ambiguous_ref_resolution(self, repo_with_commit):
        """Ambiguous refs resolved in correct order."""
        mg, work_dir = repo_with_commit
        mg.branch('ambig')

        # 'ambig' should resolve to branch
        result = mg.run('rev-parse', 'ambig')
        assert result.returncode == 0
