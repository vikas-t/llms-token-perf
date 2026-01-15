"""SHA-1, zlib, and path utilities for minigit."""

import hashlib
import zlib
import os
from pathlib import Path
from typing import Optional


def find_repo_root(start_path: Path = None) -> Optional[Path]:
    """Find the repository root by looking for .minigit directory."""
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


def get_minigit_dir(repo_root: Path = None) -> Path:
    """Get the .minigit directory path."""
    if repo_root is None:
        repo_root = find_repo_root()
    if repo_root is None:
        raise RuntimeError("Not a minigit repository (or any of the parent directories)")
    return repo_root / '.minigit'


def sha1_hash(data: bytes) -> str:
    """Compute SHA-1 hash of data."""
    return hashlib.sha1(data).hexdigest()


def hash_object_data(obj_type: str, data: bytes) -> str:
    """Compute SHA-1 hash of object with header."""
    header = f"{obj_type} {len(data)}\0".encode()
    return sha1_hash(header + data)


def compress_data(data: bytes) -> bytes:
    """Compress data using zlib."""
    return zlib.compress(data)


def decompress_data(data: bytes) -> bytes:
    """Decompress zlib data."""
    return zlib.decompress(data)


def write_object(repo_root: Path, obj_type: str, data: bytes) -> str:
    """Write an object to the object database and return its SHA."""
    header = f"{obj_type} {len(data)}\0".encode()
    full_data = header + data
    sha = sha1_hash(full_data)

    objects_dir = repo_root / '.minigit' / 'objects'
    obj_dir = objects_dir / sha[:2]
    obj_path = obj_dir / sha[2:]

    if not obj_path.exists():
        obj_dir.mkdir(parents=True, exist_ok=True)
        compressed = compress_data(full_data)
        obj_path.write_bytes(compressed)

    return sha


def read_object(repo_root: Path, sha: str) -> tuple[str, bytes]:
    """Read an object from the object database. Returns (type, data)."""
    # Handle abbreviated SHA
    if len(sha) < 40:
        sha = expand_sha(repo_root, sha)

    objects_dir = repo_root / '.minigit' / 'objects'
    obj_path = objects_dir / sha[:2] / sha[2:]

    if not obj_path.exists():
        raise ValueError(f"Object {sha} not found")

    compressed = obj_path.read_bytes()
    full_data = decompress_data(compressed)

    # Parse header
    null_idx = full_data.index(b'\0')
    header = full_data[:null_idx].decode()
    obj_type, size_str = header.split(' ')
    data = full_data[null_idx + 1:]

    return obj_type, data


def expand_sha(repo_root: Path, short_sha: str) -> str:
    """Expand an abbreviated SHA to full 40 characters."""
    if len(short_sha) >= 40:
        return short_sha

    objects_dir = repo_root / '.minigit' / 'objects'
    if len(short_sha) < 2:
        raise ValueError(f"SHA too short: {short_sha}")

    prefix_dir = objects_dir / short_sha[:2]
    if not prefix_dir.exists():
        raise ValueError(f"Object {short_sha} not found")

    rest = short_sha[2:]
    matches = []
    for obj_file in prefix_dir.iterdir():
        if obj_file.name.startswith(rest):
            matches.append(short_sha[:2] + obj_file.name)

    if len(matches) == 0:
        raise ValueError(f"Object {short_sha} not found")
    elif len(matches) > 1:
        raise ValueError(f"Ambiguous SHA: {short_sha}")

    return matches[0]


def relative_path(repo_root: Path, abs_path: Path) -> str:
    """Get path relative to repo root."""
    try:
        return str(abs_path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return str(abs_path)


def is_binary_file(data: bytes) -> bool:
    """Check if data appears to be binary."""
    # Check for null bytes in first 8KB
    sample = data[:8192]
    return b'\0' in sample
