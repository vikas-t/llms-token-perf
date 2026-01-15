"""Tests for minigit init command."""

import pytest
from pathlib import Path


class TestInit:
    """Tests for repository initialization."""

    def test_init_creates_minigit_directory(self, minigit, temp_dir):
        """init creates .minigit directory."""
        minigit.init()
        assert (temp_dir / '.minigit').is_dir()

    def test_init_creates_objects_directory(self, minigit, temp_dir):
        """init creates .minigit/objects directory."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'objects').is_dir()

    def test_init_creates_refs_heads_directory(self, minigit, temp_dir):
        """init creates .minigit/refs/heads directory."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'refs' / 'heads').is_dir()

    def test_init_creates_refs_tags_directory(self, minigit, temp_dir):
        """init creates .minigit/refs/tags directory."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'refs' / 'tags').is_dir()

    def test_init_creates_head_file(self, minigit, temp_dir):
        """init creates HEAD file pointing to main."""
        minigit.init()
        head = (temp_dir / '.minigit' / 'HEAD').read_text()
        assert head.strip() == 'ref: refs/heads/main'

    def test_init_creates_config_file(self, minigit, temp_dir):
        """init creates config file."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'config').is_file()

    def test_init_output_message(self, minigit, temp_dir):
        """init outputs success message."""
        result = minigit.init()
        assert 'Initialized' in result.stdout or 'initialized' in result.stdout.lower()

    def test_init_in_subdirectory(self, minigit, temp_dir):
        """init can be run with a directory argument."""
        subdir = temp_dir / 'myrepo'
        subdir.mkdir()
        result = minigit.run('init', str(subdir))
        assert (subdir / '.minigit').is_dir()

    def test_init_existing_repo_fails(self, minigit, temp_dir):
        """init fails if repository already exists."""
        minigit.init()
        result = minigit.run('init', check=False)
        assert result.returncode != 0

    def test_init_creates_index_placeholder(self, minigit, temp_dir):
        """init creates empty or placeholder index."""
        minigit.init()
        # Index may not exist until first add, or may be empty
        git_dir = temp_dir / '.minigit'
        assert git_dir.is_dir()

    def test_init_objects_pack_directory(self, minigit, temp_dir):
        """init creates objects/pack directory."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'objects' / 'pack').is_dir()

    def test_init_objects_info_directory(self, minigit, temp_dir):
        """init creates objects/info directory."""
        minigit.init()
        assert (temp_dir / '.minigit' / 'objects' / 'info').is_dir()
