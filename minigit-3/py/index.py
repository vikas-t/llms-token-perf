"""Binary index read/write for minigit."""

import struct
import os
import hashlib
from pathlib import Path
from typing import Optional


INDEX_SIGNATURE = b'DIRC'
INDEX_VERSION = 2


def read_index(repo_root: Path) -> list[dict]:
    """Read the index file and return list of entries."""
    index_path = repo_root / '.minigit' / 'index'
    if not index_path.exists():
        return []

    data = index_path.read_bytes()
    if len(data) < 12:
        return []

    # Verify signature
    sig = data[:4]
    if sig != INDEX_SIGNATURE:
        return []

    version = struct.unpack('>I', data[4:8])[0]
    entry_count = struct.unpack('>I', data[8:12])[0]

    entries = []
    pos = 12

    for _ in range(entry_count):
        if pos + 62 > len(data):
            break

        # Read fixed fields
        ctime_s = struct.unpack('>I', data[pos:pos+4])[0]
        ctime_ns = struct.unpack('>I', data[pos+4:pos+8])[0]
        mtime_s = struct.unpack('>I', data[pos+8:pos+12])[0]
        mtime_ns = struct.unpack('>I', data[pos+12:pos+16])[0]
        dev = struct.unpack('>I', data[pos+16:pos+20])[0]
        ino = struct.unpack('>I', data[pos+20:pos+24])[0]
        mode = struct.unpack('>I', data[pos+24:pos+28])[0]
        uid = struct.unpack('>I', data[pos+28:pos+32])[0]
        gid = struct.unpack('>I', data[pos+32:pos+36])[0]
        size = struct.unpack('>I', data[pos+36:pos+40])[0]
        sha = data[pos+40:pos+60].hex()
        flags = struct.unpack('>H', data[pos+60:pos+62])[0]

        name_len = flags & 0xFFF
        pos += 62

        # Read name
        name_end = pos + name_len
        name = data[pos:name_end].decode()
        pos = name_end

        # Skip to next 8-byte boundary (including null terminator)
        # Entry size is (62 + name_len + 1) padded to 8-byte boundary
        entry_len = 62 + name_len + 1
        padding = (8 - (entry_len % 8)) % 8
        pos += 1 + padding

        # Convert mode to string format
        mode_str = oct(mode)[2:]  # Remove '0o' prefix
        if mode_str.startswith('100'):
            mode_str = mode_str  # Keep as-is
        elif mode_str.startswith('120'):
            mode_str = '120000'
        elif mode_str.startswith('40'):
            mode_str = '40000'

        entries.append({
            'path': name,
            'sha': sha,
            'mode': mode_str,
            'ctime': (ctime_s, ctime_ns),
            'mtime': (mtime_s, mtime_ns),
            'dev': dev,
            'ino': ino,
            'uid': uid,
            'gid': gid,
            'size': size,
            'flags': flags
        })

    return entries


def write_index(repo_root: Path, entries: list[dict]) -> None:
    """Write entries to the index file."""
    # Sort entries by path
    sorted_entries = sorted(entries, key=lambda e: e['path'])

    # Build header
    data = INDEX_SIGNATURE
    data += struct.pack('>I', INDEX_VERSION)
    data += struct.pack('>I', len(sorted_entries))

    # Add entries
    for entry in sorted_entries:
        ctime = entry.get('ctime', (0, 0))
        mtime = entry.get('mtime', (0, 0))

        data += struct.pack('>I', ctime[0])
        data += struct.pack('>I', ctime[1])
        data += struct.pack('>I', mtime[0])
        data += struct.pack('>I', mtime[1])
        data += struct.pack('>I', entry.get('dev', 0))
        data += struct.pack('>I', entry.get('ino', 0))

        # Convert mode string to int
        mode_str = entry.get('mode', '100644')
        mode_int = int(mode_str, 8)
        data += struct.pack('>I', mode_int)

        data += struct.pack('>I', entry.get('uid', 0))
        data += struct.pack('>I', entry.get('gid', 0))
        data += struct.pack('>I', entry.get('size', 0))

        # SHA as bytes
        data += bytes.fromhex(entry['sha'])

        # Flags (name length in lower 12 bits)
        name = entry['path']
        name_len = min(len(name), 0xFFF)
        data += struct.pack('>H', name_len)

        # Name + null terminator + padding
        data += name.encode()
        data += b'\0'

        # Pad to 8-byte boundary
        entry_len = 62 + len(name) + 1
        padding = (8 - (entry_len % 8)) % 8
        data += b'\0' * padding

    # Add checksum
    checksum = hashlib.sha1(data).digest()
    data += checksum

    # Write file
    index_path = repo_root / '.minigit' / 'index'
    index_path.write_bytes(data)


def add_to_index(repo_root: Path, path: str, sha: str, mode: str, stat_info=None) -> None:
    """Add or update an entry in the index."""
    entries = read_index(repo_root)

    # Get stat info
    if stat_info is None:
        full_path = repo_root / path
        if full_path.exists():
            stat = full_path.stat()
            ctime = (int(stat.st_ctime), int((stat.st_ctime % 1) * 1e9))
            mtime = (int(stat.st_mtime), int((stat.st_mtime % 1) * 1e9))
            dev = stat.st_dev
            ino = stat.st_ino
            uid = stat.st_uid
            gid = stat.st_gid
            size = stat.st_size
        else:
            ctime = mtime = (0, 0)
            dev = ino = uid = gid = size = 0
    else:
        stat = stat_info
        ctime = (int(stat.st_ctime), int((stat.st_ctime % 1) * 1e9))
        mtime = (int(stat.st_mtime), int((stat.st_mtime % 1) * 1e9))
        dev = stat.st_dev
        ino = stat.st_ino
        uid = stat.st_uid
        gid = stat.st_gid
        size = stat.st_size

    new_entry = {
        'path': path,
        'sha': sha,
        'mode': mode,
        'ctime': ctime,
        'mtime': mtime,
        'dev': dev,
        'ino': ino,
        'uid': uid,
        'gid': gid,
        'size': size,
        'flags': min(len(path), 0xFFF)
    }

    # Find and replace or add
    found = False
    for i, entry in enumerate(entries):
        if entry['path'] == path:
            entries[i] = new_entry
            found = True
            break

    if not found:
        entries.append(new_entry)

    write_index(repo_root, entries)


def remove_from_index(repo_root: Path, path: str) -> bool:
    """Remove an entry from the index. Returns True if removed."""
    entries = read_index(repo_root)
    new_entries = [e for e in entries if e['path'] != path]

    if len(new_entries) < len(entries):
        write_index(repo_root, new_entries)
        return True
    return False


def get_index_entry(repo_root: Path, path: str) -> Optional[dict]:
    """Get a specific entry from the index."""
    entries = read_index(repo_root)
    for entry in entries:
        if entry['path'] == path:
            return entry
    return None


def clear_index(repo_root: Path) -> None:
    """Clear all entries from the index."""
    write_index(repo_root, [])
