"""Utility functions for Mini Git."""

import hashlib
import zlib
import os
from pathlib import Path
from typing import Optional


def find_repo_root(start_path: Optional[Path] = None) -> Optional[Path]:
    """Find the root of the minigit repository."""
    if start_path is None:
        start_path = Path.cwd()

    current = start_path.resolve()
    while current != current.parent:
        if (current / '.minigit').is_dir():
            return current
        current = current.parent

    if (current / '.minigit').is_dir():
        return current
    return None


def git_dir(repo_root: Optional[Path] = None) -> Path:
    """Get the .minigit directory path."""
    if repo_root is None:
        repo_root = find_repo_root()
    if repo_root is None:
        raise RuntimeError("Not a minigit repository")
    return repo_root / '.minigit'


def hash_object_data(obj_type: str, data: bytes) -> str:
    """Compute SHA-1 hash for an object."""
    header = f"{obj_type} {len(data)}\0".encode()
    full_data = header + data
    return hashlib.sha1(full_data).hexdigest()


def write_object(obj_type: str, data: bytes, repo_root: Optional[Path] = None) -> str:
    """Write an object to the object store and return its SHA."""
    sha = hash_object_data(obj_type, data)
    obj_dir = git_dir(repo_root) / 'objects' / sha[:2]
    obj_path = obj_dir / sha[2:]

    if not obj_path.exists():
        obj_dir.mkdir(parents=True, exist_ok=True)
        header = f"{obj_type} {len(data)}\0".encode()
        compressed = zlib.compress(header + data)
        obj_path.write_bytes(compressed)

    return sha


def read_object(sha: str, repo_root: Optional[Path] = None) -> tuple[str, bytes]:
    """Read an object from the object store. Returns (type, data)."""
    gd = git_dir(repo_root)
    obj_path = gd / 'objects' / sha[:2] / sha[2:]

    if not obj_path.exists():
        raise ValueError(f"Object not found: {sha}")

    compressed = obj_path.read_bytes()
    decompressed = zlib.decompress(compressed)

    # Parse header
    null_idx = decompressed.index(b'\0')
    header = decompressed[:null_idx].decode()
    obj_type, size = header.split(' ')
    data = decompressed[null_idx + 1:]

    return obj_type, data


def resolve_short_sha(short_sha: str, repo_root: Optional[Path] = None) -> Optional[str]:
    """Resolve a short SHA to a full SHA."""
    if len(short_sha) < 4:
        return None

    gd = git_dir(repo_root)
    prefix = short_sha[:2]
    rest = short_sha[2:]

    obj_dir = gd / 'objects' / prefix
    if not obj_dir.exists():
        return None

    matches = [f.name for f in obj_dir.iterdir() if f.name.startswith(rest)]

    if len(matches) == 1:
        return prefix + matches[0]
    elif len(matches) == 0:
        return None
    else:
        # Ambiguous
        return None


def get_file_mode(path: Path) -> int:
    """Get the mode of a file for git storage."""
    if path.is_symlink():
        return 0o120000
    elif os.access(path, os.X_OK):
        return 0o100755
    else:
        return 0o100644


def format_mode(mode: int) -> str:
    """Format mode as string for tree entry."""
    return f"{mode:o}"


def parse_mode(mode_str: str) -> int:
    """Parse mode string to integer."""
    return int(mode_str, 8)
