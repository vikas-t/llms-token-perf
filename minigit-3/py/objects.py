"""Blob, Tree, Commit, Tag object handling for minigit."""

import os
import time
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from utils import write_object, read_object, sha1_hash


@dataclass
class TreeEntry:
    """An entry in a tree object."""
    mode: str
    name: str
    sha: str


def create_blob(repo_root: Path, data: bytes) -> str:
    """Create a blob object and return its SHA."""
    return write_object(repo_root, 'blob', data)


def read_blob(repo_root: Path, sha: str) -> bytes:
    """Read a blob object and return its content."""
    obj_type, data = read_object(repo_root, sha)
    if obj_type != 'blob':
        raise ValueError(f"Expected blob, got {obj_type}")
    return data


def create_tree(repo_root: Path, entries: list[TreeEntry]) -> str:
    """Create a tree object from entries and return its SHA."""
    # Sort entries by name
    sorted_entries = sorted(entries, key=lambda e: e.name + ('/' if e.mode == '40000' else ''))

    data = b''
    for entry in sorted_entries:
        # Format: mode name\0<20-byte-sha>
        sha_bytes = bytes.fromhex(entry.sha)
        data += f"{entry.mode} {entry.name}\0".encode() + sha_bytes

    return write_object(repo_root, 'tree', data)


def read_tree(repo_root: Path, sha: str) -> list[TreeEntry]:
    """Read a tree object and return its entries."""
    obj_type, data = read_object(repo_root, sha)
    if obj_type != 'tree':
        raise ValueError(f"Expected tree, got {obj_type}")

    entries = []
    pos = 0
    while pos < len(data):
        # Find space after mode
        space_idx = data.index(b' ', pos)
        mode = data[pos:space_idx].decode()

        # Find null after name
        null_idx = data.index(b'\0', space_idx)
        name = data[space_idx + 1:null_idx].decode()

        # Next 20 bytes are SHA
        sha_bytes = data[null_idx + 1:null_idx + 21]
        entry_sha = sha_bytes.hex()

        entries.append(TreeEntry(mode=mode, name=name, sha=entry_sha))
        pos = null_idx + 21

    return entries


def get_tree_entry(repo_root: Path, tree_sha: str, path: str) -> Optional[TreeEntry]:
    """Get an entry from a tree by path (can be nested like 'dir/file')."""
    parts = path.split('/')
    current_sha = tree_sha

    for i, part in enumerate(parts):
        entries = read_tree(repo_root, current_sha)
        found = None
        for entry in entries:
            if entry.name == part:
                found = entry
                break

        if found is None:
            return None

        if i < len(parts) - 1:
            # Need to traverse into subdirectory
            if found.mode != '40000':
                return None
            current_sha = found.sha
        else:
            return found

    return None


def create_commit(repo_root: Path, tree_sha: str, message: str,
                  parents: list[str] = None, author: str = None,
                  committer: str = None, author_date: str = None,
                  committer_date: str = None) -> str:
    """Create a commit object and return its SHA."""
    if parents is None:
        parents = []

    # Get author/committer info from environment or defaults
    if author is None:
        author_name = os.environ.get('GIT_AUTHOR_NAME', 'Unknown')
        author_email = os.environ.get('GIT_AUTHOR_EMAIL', 'unknown@example.com')
        author = f"{author_name} <{author_email}>"

    if committer is None:
        committer_name = os.environ.get('GIT_COMMITTER_NAME', 'Unknown')
        committer_email = os.environ.get('GIT_COMMITTER_EMAIL', 'unknown@example.com')
        committer = f"{committer_name} <{committer_email}>"

    # Get timestamp
    if author_date is None:
        author_date = os.environ.get('GIT_AUTHOR_DATE')
    if committer_date is None:
        committer_date = os.environ.get('GIT_COMMITTER_DATE')

    timestamp = format_timestamp(author_date)
    committer_timestamp = format_timestamp(committer_date)

    # Build commit content
    lines = [f"tree {tree_sha}"]
    for parent in parents:
        lines.append(f"parent {parent}")
    lines.append(f"author {author} {timestamp}")
    lines.append(f"committer {committer} {committer_timestamp}")
    lines.append("")
    lines.append(message)

    data = '\n'.join(lines).encode()
    return write_object(repo_root, 'commit', data)


def format_timestamp(date_str: str = None) -> str:
    """Format a timestamp for commit objects."""
    if date_str:
        # Parse ISO format
        try:
            from datetime import datetime
            if 'T' in date_str:
                # ISO format with timezone
                dt_part = date_str.split('+')[0].split('-')[0:3]
                if 'T' in date_str:
                    parts = date_str.replace('T', ' ').replace('+', ' +').replace('-', ' -', 2)
                    # Handle format like 2024-01-01T00:00:00+00:00
                    import re
                    match = re.match(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})', date_str)
                    if match:
                        year, month, day, hour, minute, second, tz_sign, tz_hour, tz_min = match.groups()
                        dt = datetime(int(year), int(month), int(day), int(hour), int(minute), int(second))
                        import calendar
                        ts = calendar.timegm(dt.timetuple())
                        tz_offset_mins = int(tz_hour) * 60 + int(tz_min)
                        if tz_sign == '-':
                            tz_offset_mins = -tz_offset_mins
                            ts += tz_offset_mins * 60  # Add back because we want UTC
                        else:
                            ts -= tz_offset_mins * 60
                        tz_str = f"{tz_sign}{tz_hour}{tz_min}"
                        return f"{ts} {tz_str}"
            # Unix timestamp
            ts = int(float(date_str))
            return f"{ts} +0000"
        except:
            pass

    # Default to current time
    ts = int(time.time())
    return f"{ts} +0000"


def read_commit(repo_root: Path, sha: str) -> dict:
    """Read a commit object and return its parts."""
    obj_type, data = read_object(repo_root, sha)
    if obj_type != 'commit':
        raise ValueError(f"Expected commit, got {obj_type}")

    text = data.decode()
    lines = text.split('\n')

    result = {
        'tree': None,
        'parents': [],
        'author': None,
        'committer': None,
        'message': ''
    }

    i = 0
    while i < len(lines):
        line = lines[i]
        if line == '':
            # Message starts after empty line
            result['message'] = '\n'.join(lines[i + 1:])
            break
        elif line.startswith('tree '):
            result['tree'] = line[5:]
        elif line.startswith('parent '):
            result['parents'].append(line[7:])
        elif line.startswith('author '):
            result['author'] = line[7:]
        elif line.startswith('committer '):
            result['committer'] = line[10:]
        i += 1

    return result


def create_tag(repo_root: Path, name: str, target_sha: str,
               message: str = None, tagger: str = None) -> str:
    """Create an annotated tag object and return its SHA."""
    if tagger is None:
        tagger_name = os.environ.get('GIT_COMMITTER_NAME', 'Unknown')
        tagger_email = os.environ.get('GIT_COMMITTER_EMAIL', 'unknown@example.com')
        tagger = f"{tagger_name} <{tagger_email}>"

    timestamp = format_timestamp(os.environ.get('GIT_COMMITTER_DATE'))

    # Determine target type
    obj_type, _ = read_object(repo_root, target_sha)

    lines = [
        f"object {target_sha}",
        f"type {obj_type}",
        f"tag {name}",
        f"tagger {tagger} {timestamp}",
        "",
        message or ""
    ]

    data = '\n'.join(lines).encode()
    return write_object(repo_root, 'tag', data)


def read_tag(repo_root: Path, sha: str) -> dict:
    """Read a tag object and return its parts."""
    obj_type, data = read_object(repo_root, sha)
    if obj_type != 'tag':
        raise ValueError(f"Expected tag, got {obj_type}")

    text = data.decode()
    lines = text.split('\n')

    result = {
        'object': None,
        'type': None,
        'tag': None,
        'tagger': None,
        'message': ''
    }

    i = 0
    while i < len(lines):
        line = lines[i]
        if line == '':
            result['message'] = '\n'.join(lines[i + 1:])
            break
        elif line.startswith('object '):
            result['object'] = line[7:]
        elif line.startswith('type '):
            result['type'] = line[5:]
        elif line.startswith('tag '):
            result['tag'] = line[4:]
        elif line.startswith('tagger '):
            result['tagger'] = line[7:]
        i += 1

    return result


def build_tree_from_index(repo_root: Path, entries: list) -> str:
    """Build tree object(s) from index entries. Returns root tree SHA."""
    from collections import defaultdict

    # Group entries by their immediate parent directory
    dirs = defaultdict(list)  # dir_path -> list of (name, mode, sha)

    # Also track all directories that need to be created
    all_dirs = set()
    all_dirs.add('')  # Root is always needed

    for entry in entries:
        path = entry['path']
        if '/' in path:
            parts = path.split('/')
            dir_path = '/'.join(parts[:-1])
            name = parts[-1]
            # Add all parent directories
            current = ''
            for part in parts[:-1]:
                current = f"{current}/{part}" if current else part
                all_dirs.add(current)
        else:
            dir_path = ''
            name = path

        dirs[dir_path].append((name, entry['mode'], entry['sha']))

    # Build trees bottom-up (deepest directories first)
    tree_cache = {}  # dir_path -> tree_sha

    # Sort directories by depth (deepest first), then by path length (longest first)
    # This ensures subdirectories are processed before their parents
    sorted_dirs = sorted(all_dirs, key=lambda d: (-d.count('/'), -len(d), d))

    for dir_path in sorted_dirs:
        tree_entries = []

        # Add file entries in this directory
        for name, mode, sha in dirs.get(dir_path, []):
            tree_entries.append(TreeEntry(mode=mode, name=name, sha=sha))

        # Add subdirectory entries (direct children only)
        prefix = dir_path + '/' if dir_path else ''
        for cached_path, cached_sha in tree_cache.items():
            if not cached_path:
                continue
            if dir_path == '':
                # Root directory - check for top-level directories
                if '/' not in cached_path:
                    tree_entries.append(TreeEntry(mode='40000', name=cached_path, sha=cached_sha))
            elif cached_path.startswith(prefix):
                remaining = cached_path[len(prefix):]
                if '/' not in remaining:
                    tree_entries.append(TreeEntry(mode='40000', name=remaining, sha=cached_sha))

        tree_sha = create_tree(repo_root, tree_entries)
        tree_cache[dir_path] = tree_sha

    return tree_cache.get('', create_tree(repo_root, []))
