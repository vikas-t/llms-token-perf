"""Binary index file handling for Mini Git."""

import struct
import os
import hashlib
from pathlib import Path
from typing import List, Optional, Dict
from dataclasses import dataclass

from utils import sha1_hash, find_repo_root, get_minigit_dir


@dataclass
class IndexEntry:
    """Single entry in the index."""
    ctime_s: int
    ctime_ns: int
    mtime_s: int
    mtime_ns: int
    dev: int
    ino: int
    mode: int
    uid: int
    gid: int
    size: int
    sha: str
    flags: int
    name: str

    @classmethod
    def from_file(cls, path: Path, sha: str, repo_root: Path) -> 'IndexEntry':
        """Create index entry from a file."""
        stat = path.stat()
        rel_path = str(path.relative_to(repo_root))

        # Determine mode
        if path.is_symlink():
            mode = 0o120000
        elif os.access(path, os.X_OK):
            mode = 0o100755
        else:
            mode = 0o100644

        name_len = min(len(rel_path), 0xFFF)
        flags = name_len

        return cls(
            ctime_s=int(stat.st_ctime),
            ctime_ns=int((stat.st_ctime % 1) * 1e9),
            mtime_s=int(stat.st_mtime),
            mtime_ns=int((stat.st_mtime % 1) * 1e9),
            dev=stat.st_dev & 0xFFFFFFFF,
            ino=stat.st_ino & 0xFFFFFFFF,
            mode=mode,
            uid=stat.st_uid,
            gid=stat.st_gid,
            size=stat.st_size,
            sha=sha,
            flags=flags,
            name=rel_path
        )


class Index:
    """Git index (staging area)."""

    SIGNATURE = b'DIRC'
    VERSION = 2

    def __init__(self):
        self.entries: Dict[str, IndexEntry] = {}

    def add_entry(self, entry: IndexEntry):
        """Add or update an entry in the index."""
        self.entries[entry.name] = entry

    def remove_entry(self, name: str):
        """Remove an entry from the index."""
        if name in self.entries:
            del self.entries[name]

    def get_entry(self, name: str) -> Optional[IndexEntry]:
        """Get an entry by name."""
        return self.entries.get(name)

    def get_sorted_entries(self) -> List[IndexEntry]:
        """Get entries sorted by name."""
        return sorted(self.entries.values(), key=lambda e: e.name)

    def write(self, repo_root: Optional[Path] = None):
        """Write index to disk."""
        if repo_root is None:
            repo_root = find_repo_root()
        index_path = get_minigit_dir(repo_root) / 'index'

        entries = self.get_sorted_entries()

        # Build content
        content = bytearray()

        # Header
        content.extend(self.SIGNATURE)
        content.extend(struct.pack('>I', self.VERSION))
        content.extend(struct.pack('>I', len(entries)))

        # Entries
        for entry in entries:
            content.extend(struct.pack('>II', entry.ctime_s, entry.ctime_ns))
            content.extend(struct.pack('>II', entry.mtime_s, entry.mtime_ns))
            content.extend(struct.pack('>I', entry.dev))
            content.extend(struct.pack('>I', entry.ino))
            content.extend(struct.pack('>I', entry.mode))
            content.extend(struct.pack('>I', entry.uid))
            content.extend(struct.pack('>I', entry.gid))
            content.extend(struct.pack('>I', entry.size))
            content.extend(bytes.fromhex(entry.sha))
            content.extend(struct.pack('>H', entry.flags))
            content.extend(entry.name.encode())
            content.extend(b'\x00')

            # Padding to 8-byte boundary
            # Entry size = 62 + name_len + 1 (null)
            entry_size = 62 + len(entry.name) + 1
            padding = (8 - (entry_size % 8)) % 8
            content.extend(b'\x00' * padding)

        # Checksum
        checksum = hashlib.sha1(content).digest()
        content.extend(checksum)

        index_path.write_bytes(bytes(content))

    @classmethod
    def read(cls, repo_root: Optional[Path] = None) -> 'Index':
        """Read index from disk."""
        if repo_root is None:
            repo_root = find_repo_root()
        index_path = get_minigit_dir(repo_root) / 'index'

        index = cls()

        if not index_path.exists():
            return index

        content = index_path.read_bytes()
        if len(content) < 12:
            return index

        # Parse header
        signature = content[:4]
        if signature != cls.SIGNATURE:
            raise ValueError("Invalid index signature")

        version = struct.unpack('>I', content[4:8])[0]
        if version != cls.VERSION:
            raise ValueError(f"Unsupported index version: {version}")

        num_entries = struct.unpack('>I', content[8:12])[0]

        # Parse entries
        pos = 12
        for _ in range(num_entries):
            ctime_s, ctime_ns = struct.unpack('>II', content[pos:pos + 8])
            pos += 8
            mtime_s, mtime_ns = struct.unpack('>II', content[pos:pos + 8])
            pos += 8
            dev = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            ino = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            mode = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            uid = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            gid = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            size = struct.unpack('>I', content[pos:pos + 4])[0]
            pos += 4
            sha = content[pos:pos + 20].hex()
            pos += 20
            flags = struct.unpack('>H', content[pos:pos + 2])[0]
            pos += 2

            # Read name until null byte
            name_end = content.index(b'\x00', pos)
            name = content[pos:name_end].decode()
            pos = name_end + 1

            # Skip padding
            entry_size = 62 + len(name) + 1
            padding = (8 - (entry_size % 8)) % 8
            pos += padding

            entry = IndexEntry(
                ctime_s=ctime_s,
                ctime_ns=ctime_ns,
                mtime_s=mtime_s,
                mtime_ns=mtime_ns,
                dev=dev,
                ino=ino,
                mode=mode,
                uid=uid,
                gid=gid,
                size=size,
                sha=sha,
                flags=flags,
                name=name
            )
            index.add_entry(entry)

        return index


def read_index(repo_root: Optional[Path] = None) -> Index:
    """Read the index file."""
    return Index.read(repo_root)


def write_index(index: Index, repo_root: Optional[Path] = None):
    """Write the index file."""
    index.write(repo_root)
