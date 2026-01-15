"""
Shared test fixtures for Mini Git implementations.

Tests are language-agnostic - they call the CLI and verify behavior.
Set MINIGIT_IMPL environment variable to: 'typescript', 'python', or 'go'
"""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Optional
import pytest


def get_minigit_command() -> list[str]:
    """Get the command to run minigit based on implementation."""
    impl = os.environ.get('MINIGIT_IMPL', 'py')
    base_dir = Path(__file__).parent.parent

    if impl == 'ts':
        return ['node', str(base_dir / 'ts' / 'dist' / 'index.js')]
    elif impl == 'py':
        return ['python3', str(base_dir / 'py' / 'minigit.py')]
    elif impl == 'go':
        return [str(base_dir / 'go' / 'minigit')]
    else:
        raise ValueError(f"Unknown implementation: {impl}. Use 'py', 'ts', or 'go'")


class MiniGit:
    """Helper class to run minigit commands."""

    def __init__(self, work_dir: Path):
        self.work_dir = work_dir
        self.cmd_prefix = get_minigit_command()

    def run(self, *args: str, check: bool = True, input: Optional[str] = None) -> subprocess.CompletedProcess:
        """Run a minigit command."""
        cmd = self.cmd_prefix + list(args)
        result = subprocess.run(
            cmd,
            cwd=self.work_dir,
            capture_output=True,
            text=True,
            input=input,
            env={**os.environ, 'GIT_AUTHOR_NAME': 'Test User',
                 'GIT_AUTHOR_EMAIL': 'test@example.com',
                 'GIT_COMMITTER_NAME': 'Test User',
                 'GIT_COMMITTER_EMAIL': 'test@example.com',
                 'GIT_AUTHOR_DATE': '2024-01-01T00:00:00+00:00',
                 'GIT_COMMITTER_DATE': '2024-01-01T00:00:00+00:00'}
        )
        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, cmd, result.stdout, result.stderr
            )
        return result

    def init(self) -> subprocess.CompletedProcess:
        return self.run('init')

    def add(self, *paths: str) -> subprocess.CompletedProcess:
        return self.run('add', *paths)

    def commit(self, message: str) -> subprocess.CompletedProcess:
        return self.run('commit', '-m', message)

    def status(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('status', *args)

    def log(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('log', *args)

    def diff(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('diff', *args)

    def branch(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('branch', *args)

    def checkout(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('checkout', *args)

    def merge(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('merge', *args)

    def show(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('show', *args)

    def cat_file(self, *args: str) -> subprocess.CompletedProcess:
        return self.run('cat-file', *args)


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests."""
    d = tempfile.mkdtemp(prefix='minigit_test_')
    yield Path(d)
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def minigit(temp_dir) -> MiniGit:
    """Create a MiniGit helper for the temp directory."""
    return MiniGit(temp_dir)


@pytest.fixture
def repo(minigit, temp_dir) -> tuple[MiniGit, Path]:
    """Create an initialized repository."""
    minigit.init()
    return minigit, temp_dir


@pytest.fixture
def repo_with_commit(repo) -> tuple[MiniGit, Path]:
    """Create a repository with one commit."""
    mg, work_dir = repo
    (work_dir / 'file.txt').write_text('hello\n')
    mg.add('file.txt')
    mg.commit('Initial commit')
    return mg, work_dir
