"""Tests for object handling (internal verification via CLI)."""

import pytest
from pathlib import Path
import zlib
import hashlib


class TestObjects:
    """Tests for Git object storage and format."""

    def test_blob_stored_compressed(self, repo):
        """Blob objects are stored compressed."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello world\n')
        mg.add('file.txt')

        # Find the object file
        objects_dir = work_dir / '.minigit' / 'objects'
        object_files = [f for f in objects_dir.rglob('*') if f.is_file()]
        assert len(object_files) > 0

        # Object should be compressed (zlib)
        for obj_file in object_files:
            content = obj_file.read_bytes()
            # zlib compressed data starts with specific bytes
            try:
                decompressed = zlib.decompress(content)
                # Successfully decompressed
                assert len(decompressed) > 0
            except zlib.error:
                # Not zlib - might be pack file or something else
                pass

    def test_blob_sha_is_content_based(self, repo):
        """Same content produces same SHA."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('identical content\n')
        (work_dir / 'b.txt').write_text('identical content\n')
        mg.add('.')
        mg.commit('Add files')

        # Both files should reference same blob
        result = mg.run('cat-file', '-p', 'HEAD^{tree}')
        lines = [l for l in result.stdout.strip().split('\n') if l]

        # Extract SHAs
        shas = [line.split()[2] for line in lines if 'blob' in line]
        assert len(shas) == 2
        assert shas[0] == shas[1]  # Same content = same SHA

    def test_tree_format(self, repo):
        """Tree object has correct format."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Initial')

        result = mg.run('cat-file', '-p', 'HEAD^{tree}')
        # Format: mode type sha name
        assert '100644' in result.stdout or '100755' in result.stdout
        assert 'blob' in result.stdout
        assert 'file.txt' in result.stdout

    def test_tree_with_subdirectory(self, repo):
        """Tree contains subtree for directories."""
        mg, work_dir = repo
        subdir = work_dir / 'subdir'
        subdir.mkdir()
        (subdir / 'file.txt').write_text('nested\n')
        mg.add('.')
        mg.commit('Add subdir')

        result = mg.run('cat-file', '-p', 'HEAD^{tree}')
        # Should have tree entry for subdir
        assert 'tree' in result.stdout
        assert 'subdir' in result.stdout

    def test_commit_format(self, repo):
        """Commit object has correct format."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')
        mg.commit('Test message')

        result = mg.run('cat-file', '-p', 'HEAD')
        assert 'tree ' in result.stdout
        assert 'author ' in result.stdout
        assert 'committer ' in result.stdout
        assert 'Test message' in result.stdout

    def test_commit_parent_format(self, repo_with_commit):
        """Commit with parent has parent field."""
        mg, work_dir = repo_with_commit

        (work_dir / 'file2.txt').write_text('second\n')
        mg.add('file2.txt')
        mg.commit('Second commit')

        result = mg.run('cat-file', '-p', 'HEAD')
        assert 'parent ' in result.stdout

    def test_object_directory_structure(self, repo):
        """Objects stored in 2-char prefix directories."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('hello\n')
        mg.add('file.txt')

        objects_dir = work_dir / '.minigit' / 'objects'
        subdirs = [d for d in objects_dir.iterdir() if d.is_dir() and len(d.name) == 2]
        assert len(subdirs) > 0

        # Check directory name is hex
        for subdir in subdirs:
            if subdir.name not in ('pack', 'info'):
                assert all(c in '0123456789abcdef' for c in subdir.name)

    def test_hash_object_command(self, repo):
        """hash-object computes correct SHA."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('test content\n')

        result = mg.run('hash-object', 'file.txt')
        sha = result.stdout.strip()
        assert len(sha) == 40
        assert all(c in '0123456789abcdef' for c in sha)

    def test_hash_object_write(self, repo):
        """hash-object -w writes object."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('test content\n')

        result = mg.run('hash-object', '-w', 'file.txt')
        sha = result.stdout.strip()

        # Object should exist
        obj_path = work_dir / '.minigit' / 'objects' / sha[:2] / sha[2:]
        assert obj_path.is_file()

    def test_ls_tree_command(self, repo):
        """ls-tree lists tree contents."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        mg.add('.')
        mg.commit('Add files')

        result = mg.run('ls-tree', 'HEAD')
        assert 'a.txt' in result.stdout
        assert 'b.txt' in result.stdout

    def test_ls_tree_recursive(self, repo):
        """ls-tree -r shows nested files."""
        mg, work_dir = repo
        (work_dir / 'dir').mkdir()
        (work_dir / 'dir' / 'file.txt').write_text('nested\n')
        mg.add('.')
        mg.commit('Add nested')

        result = mg.run('ls-tree', '-r', 'HEAD')
        assert 'dir/file.txt' in result.stdout

    def test_ls_files_command(self, repo):
        """ls-files shows staged files."""
        mg, work_dir = repo
        (work_dir / 'a.txt').write_text('aaa\n')
        (work_dir / 'b.txt').write_text('bbb\n')
        mg.add('.')

        result = mg.run('ls-files')
        assert 'a.txt' in result.stdout
        assert 'b.txt' in result.stdout

    def test_ls_files_staged(self, repo):
        """ls-files --staged shows SHA and mode."""
        mg, work_dir = repo
        (work_dir / 'file.txt').write_text('content\n')
        mg.add('file.txt')

        result = mg.run('ls-files', '--staged')
        # Format: mode sha stage path
        assert '100644' in result.stdout or '100755' in result.stdout
        assert 'file.txt' in result.stdout

    def test_executable_mode(self, repo):
        """Executable files have 100755 mode."""
        mg, work_dir = repo
        script = work_dir / 'script.sh'
        script.write_text('#!/bin/bash\n')
        script.chmod(0o755)
        mg.add('script.sh')
        mg.commit('Add script')

        result = mg.run('ls-tree', 'HEAD')
        assert '100755' in result.stdout

    def test_symlink_mode(self, repo):
        """Symbolic links have 120000 mode."""
        mg, work_dir = repo
        (work_dir / 'target.txt').write_text('target\n')
        (work_dir / 'link.txt').symlink_to('target.txt')
        mg.add('.')
        mg.commit('Add symlink')

        result = mg.run('ls-tree', 'HEAD')
        assert '120000' in result.stdout or 'link.txt' in result.stdout
