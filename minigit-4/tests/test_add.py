"""Tests for minigit add command."""

import pytest
from pathlib import Path


class TestAdd:
    """Tests for staging files."""

    def test_add_single_file(self, repo):
        """add stages a single file."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        result = mg.add('file.txt')
        assert result.returncode == 0

    def test_add_creates_blob_object(self, repo):
        """add creates a blob object in objects directory."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')

        objects_dir = work_dir / '.minigit' / 'objects'
        # Should have at least one object (2-char dir + hash file)
        object_dirs = [d for d in objects_dir.iterdir() if d.is_dir() and len(d.name) == 2]
        assert len(object_dirs) > 0

    def test_add_multiple_files(self, repo):
        """add can stage multiple files."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        result = mg.add('a.txt', 'b.txt')
        assert result.returncode == 0

    def test_add_directory(self, repo):
        """add can stage a directory recursively."""
        mg, work_dir = repo
        subdir = work_dir / 'subdir'
        subdir.mkdir()
        (subdir / 'file.txt').write_text('in subdir\n')
        result = mg.add('subdir')
        assert result.returncode == 0

    def test_add_dot(self, repo):
        """add . stages all files."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        result = mg.add('.')
        assert result.returncode == 0

    def test_add_nonexistent_file_fails(self, repo):
        """add fails for nonexistent file."""
        mg, work_dir = repo
        result = mg.run('add', 'nonexistent.txt', check=False)
        assert result.returncode != 0

    def test_add_updates_index(self, repo):
        """add updates the index file."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        assert (work_dir / '.minigit' / 'index').is_file()

    def test_add_modified_file(self, repo):
        """add stages modifications to already tracked file."""
        mg, work_dir = repo
        f = work_dir / 'file.txt'
        f.write_text('version 1\n')
        mg.add('file.txt')
        mg.commit('first')

        f.write_text('version 2\n')
        result = mg.add('file.txt')
        assert result.returncode == 0

    def test_add_empty_file(self, repo):
        """add can stage an empty file."""
        mg, work_dir = repo
        (work_dir / 'empty.txt').write_text('')
        result = mg.add('empty.txt')
        assert result.returncode == 0

    def test_add_binary_file(self, repo):
        """add can stage a binary file."""
        mg, work_dir = repo
        (work_dir / 'binary.bin').write_bytes(bytes(range(256)))
        result = mg.add('binary.bin')
        assert result.returncode == 0

    def test_add_file_in_subdirectory(self, repo):
        """add stages file in subdirectory with correct path."""
        mg, work_dir = repo
        subdir = work_dir / 'deep' / 'nested'
        subdir.mkdir(parents=True)
        (subdir / 'file.txt').write_text('nested\n')
        result = mg.add('deep/nested/file.txt')
        assert result.returncode == 0

    def test_add_with_A_flag(self, repo):
        """add -A stages all changes including deletions."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('first')

        (work_dir / 'file.txt').unlink()
        (work_dir / 'new.txt').write_text('new\n')
        result = mg.add('-A')
        assert result.returncode == 0

    def test_add_with_u_flag(self, repo):
        """add -u stages only tracked file changes."""
        mg, work_dir = repo
        (work_dir / 'tracked.txt').write_text('v1\n')
        mg.add('tracked.txt')
        mg.commit('first')

        (work_dir / 'tracked.txt').write_text('v2\n')
        (work_dir / 'untracked.txt').write_text('new\n')
        result = mg.add('-u')
        assert result.returncode == 0

    def test_add_preserves_executable_mode(self, repo):
        """add preserves executable file mode."""
        mg, work_dir = repo
        script = work_dir / 'script.sh'
        script.write_text('#!/bin/bash\necho hello\n')
        script.chmod(0o755)
        result = mg.add('script.sh')
        assert result.returncode == 0
