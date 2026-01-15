"""Binary index file handling."""

import struct
import hashlib
import os
from pathlib import Path
from typing import Optional, List, Dict
from dataclasses import dataclass


@dataclass
class IndexEntry:
    """Represents a single entry in the index."""
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


class Index:
    """Git index (staging area) file handler."""

    SIGNATURE = b'DIRC'
    VERSION = 2

    def __init__(self, entries: Optional[List[IndexEntry]] = None):
        self.entries: Dict[str, IndexEntry] = {}
        if entries:
            for entry in entries:
                self.entries[entry.name] = entry

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

    def get_all_entries(self) -> List[IndexEntry]:
        """Get all entries sorted by name."""
        return sorted(self.entries.values(), key=lambda e: e.name)

    def serialize(self) -> bytes:
        """Serialize index to binary format."""
        entries = self.get_all_entries()

        # Header
        result = bytearray()
        result.extend(self.SIGNATURE)
        result.extend(struct.pack('>I', self.VERSION))
        result.extend(struct.pack('>I', len(entries)))

        for entry in entries:
            # Entry fixed fields
            result.extend(struct.pack('>I', entry.ctime_s))
            result.extend(struct.pack('>I', entry.ctime_ns))
            result.extend(struct.pack('>I', entry.mtime_s))
            result.extend(struct.pack('>I', entry.mtime_ns))
            result.extend(struct.pack('>I', entry.dev))
            result.extend(struct.pack('>I', entry.ino))
            result.extend(struct.pack('>I', entry.mode))
            result.extend(struct.pack('>I', entry.uid))
            result.extend(struct.pack('>I', entry.gid))
            result.extend(struct.pack('>I', entry.size))

            # SHA
            result.extend(bytes.fromhex(entry.sha))

            # Flags: name length (12 bits) + other flags
            name_len = min(len(entry.name), 0xFFF)
            flags = name_len & 0xFFF
            result.extend(struct.pack('>H', flags))

            # Name (null-terminated)
            name_bytes = entry.name.encode()
            result.extend(name_bytes)
            result.extend(b'\0')

            # Padding to 8-byte boundary
            # Entry size so far (62 bytes fixed + name + 1 null)
            entry_size = 62 + len(name_bytes) + 1
            padding = (8 - (entry_size % 8)) % 8
            result.extend(b'\0' * padding)

        # Checksum
        checksum = hashlib.sha1(result).digest()
        result.extend(checksum)

        return bytes(result)

    @classmethod
    def parse(cls, data: bytes) -> 'Index':
        """Parse binary index data."""
        if len(data) < 12:
            return cls()

        # Header
        sig = data[:4]
        if sig != cls.SIGNATURE:
            raise ValueError("Invalid index signature")

        version = struct.unpack('>I', data[4:8])[0]
        num_entries = struct.unpack('>I', data[8:12])[0]

        entries = []
        offset = 12

        for _ in range(num_entries):
            ctime_s = struct.unpack('>I', data[offset:offset + 4])[0]
            ctime_ns = struct.unpack('>I', data[offset + 4:offset + 8])[0]
            mtime_s = struct.unpack('>I', data[offset + 8:offset + 12])[0]
            mtime_ns = struct.unpack('>I', data[offset + 12:offset + 16])[0]
            dev = struct.unpack('>I', data[offset + 16:offset + 20])[0]
            ino = struct.unpack('>I', data[offset + 20:offset + 24])[0]
            mode = struct.unpack('>I', data[offset + 24:offset + 28])[0]
            uid = struct.unpack('>I', data[offset + 28:offset + 32])[0]
            gid = struct.unpack('>I', data[offset + 32:offset + 36])[0]
            size = struct.unpack('>I', data[offset + 36:offset + 40])[0]

            sha = data[offset + 40:offset + 60].hex()
            flags = struct.unpack('>H', data[offset + 60:offset + 62])[0]

            # Find null-terminated name
            name_start = offset + 62
            null_idx = data.index(b'\0', name_start)
            name = data[name_start:null_idx].decode()

            entry = IndexEntry(
                ctime_s, ctime_ns, mtime_s, mtime_ns,
                dev, ino, mode, uid, gid, size,
                sha, flags, name
            )
            entries.append(entry)

            # Calculate padding
            entry_size = 62 + len(name.encode()) + 1
            padding = (8 - (entry_size % 8)) % 8
            offset = null_idx + 1 + padding

        return cls(entries)

    def write(self, repo_root: Path):
        """Write index to disk."""
        index_path = repo_root / '.minigit' / 'index'
        index_path.write_bytes(self.serialize())

    @classmethod
    def read(cls, repo_root: Path) -> 'Index':
        """Read index from disk."""
        index_path = repo_root / '.minigit' / 'index'
        if not index_path.exists():
            return cls()
        return cls.parse(index_path.read_bytes())


def create_entry_from_file(
    path: Path,
    rel_path: str,
    sha: str,
    mode: int
) -> IndexEntry:
    """Create an index entry from a file."""
    stat = path.stat()

    return IndexEntry(
        ctime_s=int(stat.st_ctime),
        ctime_ns=int((stat.st_ctime % 1) * 1e9),
        mtime_s=int(stat.st_mtime),
        mtime_ns=int((stat.st_mtime % 1) * 1e9),
        dev=stat.st_dev,
        ino=stat.st_ino,
        mode=mode,
        uid=stat.st_uid,
        gid=stat.st_gid,
        size=stat.st_size,
        sha=sha,
        flags=0,
        name=rel_path
    )
