"""Utility functions for Mini Git - SHA-1, zlib, path utilities."""

import hashlib
import zlib
import os
from pathlib import Path
from typing import Optional


def sha1_hash(data: bytes) -> str:
    """Compute SHA-1 hash of data and return hex string."""
    return hashlib.sha1(data).hexdigest()


def compress(data: bytes) -> bytes:
    """Compress data using zlib."""
    return zlib.compress(data)


def decompress(data: bytes) -> bytes:
    """Decompress zlib-compressed data."""
    return zlib.decompress(data)


def find_repo_root(start_path: Optional[Path] = None) -> Optional[Path]:
    """Find the root of the Mini Git repository by searching for .minigit directory."""
    if start_path is None:
        start_path = Path.cwd()

    current = start_path.resolve()
    while current != current.parent:
        if (current / '.minigit').is_dir():
            return current
        current = current.parent

    # Check root as well
    if (current / '.minigit').is_dir():
        return current

    return None


def get_minigit_dir(repo_root: Optional[Path] = None) -> Path:
    """Get the .minigit directory path."""
    if repo_root is None:
        repo_root = find_repo_root()
        if repo_root is None:
            raise RuntimeError("Not a minigit repository (or any of the parent directories)")
    return repo_root / '.minigit'


def relative_path(path: Path, repo_root: Path) -> str:
    """Get path relative to repository root."""
    try:
        return str(path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return str(path)


def is_binary(data: bytes) -> bool:
    """Check if data appears to be binary."""
    # Check for null bytes in the first 8000 bytes
    return b'\x00' in data[:8000]


def format_mode(mode: int) -> str:
    """Format file mode for Git objects."""
    if mode & 0o111:  # Executable
        return '100755'
    elif os.path.islink:
        return '100644'  # Will be handled specially for symlinks
    else:
        return '100644'


def parse_mode(mode_str: str) -> int:
    """Parse mode string to integer."""
    return int(mode_str, 8)


def get_file_mode(path: Path) -> str:
    """Get the Git mode for a file."""
    if path.is_symlink():
        return '120000'
    elif os.access(path, os.X_OK):
        return '100755'
    else:
        return '100644'
