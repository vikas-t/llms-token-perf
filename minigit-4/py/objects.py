"""Git object handling - Blob, Tree, Commit, Tag."""

import os
import struct
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any

from utils import sha1_hash, compress, decompress, get_minigit_dir, find_repo_root


class GitObject:
    """Base class for Git objects."""

    obj_type: str = ''

    def __init__(self, data: bytes = b''):
        self.data = data

    def serialize(self) -> bytes:
        """Serialize object data for storage."""
        return self.data

    @classmethod
    def deserialize(cls, data: bytes) -> 'GitObject':
        """Deserialize object data."""
        obj = cls()
        obj.data = data
        return obj

    def compute_hash(self) -> str:
        """Compute SHA-1 hash of object."""
        content = self.serialize()
        header = f'{self.obj_type} {len(content)}\x00'.encode()
        return sha1_hash(header + content)


class Blob(GitObject):
    """Git blob object - stores file content."""

    obj_type = 'blob'

    def __init__(self, data: bytes = b''):
        super().__init__(data)


class TreeEntry:
    """Single entry in a tree object."""

    def __init__(self, mode: str, name: str, sha: str):
        self.mode = mode
        self.name = name
        self.sha = sha

    def __repr__(self):
        return f'TreeEntry({self.mode}, {self.name}, {self.sha})'


class Tree(GitObject):
    """Git tree object - stores directory structure."""

    obj_type = 'tree'

    def __init__(self, entries: Optional[List[TreeEntry]] = None):
        super().__init__()
        self.entries = entries or []

    def serialize(self) -> bytes:
        """Serialize tree to bytes."""
        # Sort entries: directories come after files with same prefix
        # Actually, Git sorts entries as if directories have '/' appended
        def sort_key(entry: TreeEntry) -> str:
            if entry.mode.startswith('40'):  # Directory
                return entry.name + '/'
            return entry.name

        sorted_entries = sorted(self.entries, key=sort_key)

        result = b''
        for entry in sorted_entries:
            # Format: mode SP name NUL sha(20 bytes binary)
            sha_bytes = bytes.fromhex(entry.sha)
            result += f'{entry.mode} {entry.name}\x00'.encode() + sha_bytes
        return result

    @classmethod
    def deserialize(cls, data: bytes) -> 'Tree':
        """Deserialize tree from bytes."""
        entries = []
        pos = 0
        while pos < len(data):
            # Find space
            space_pos = data.index(b' ', pos)
            mode = data[pos:space_pos].decode()

            # Find null
            null_pos = data.index(b'\x00', space_pos)
            name = data[space_pos + 1:null_pos].decode()

            # Next 20 bytes are SHA
            sha = data[null_pos + 1:null_pos + 21].hex()

            entries.append(TreeEntry(mode, name, sha))
            pos = null_pos + 21

        tree = cls(entries)
        return tree


class Commit(GitObject):
    """Git commit object."""

    obj_type = 'commit'

    def __init__(self):
        super().__init__()
        self.tree_sha: str = ''
        self.parents: List[str] = []
        self.author: str = ''
        self.committer: str = ''
        self.message: str = ''

    def serialize(self) -> bytes:
        """Serialize commit to bytes."""
        lines = []
        lines.append(f'tree {self.tree_sha}')
        for parent in self.parents:
            lines.append(f'parent {parent}')
        lines.append(f'author {self.author}')
        lines.append(f'committer {self.committer}')
        lines.append('')  # Empty line before message
        lines.append(self.message)
        return '\n'.join(lines).encode()

    @classmethod
    def deserialize(cls, data: bytes) -> 'Commit':
        """Deserialize commit from bytes."""
        commit = cls()
        text = data.decode()
        lines = text.split('\n')

        i = 0
        while i < len(lines) and lines[i]:
            line = lines[i]
            if line.startswith('tree '):
                commit.tree_sha = line[5:]
            elif line.startswith('parent '):
                commit.parents.append(line[7:])
            elif line.startswith('author '):
                commit.author = line[7:]
            elif line.startswith('committer '):
                commit.committer = line[10:]
            i += 1

        # Skip empty line
        i += 1
        # Rest is message
        commit.message = '\n'.join(lines[i:])
        return commit


class Tag(GitObject):
    """Git tag object (annotated tag)."""

    obj_type = 'tag'

    def __init__(self):
        super().__init__()
        self.object_sha: str = ''
        self.object_type: str = 'commit'
        self.tag_name: str = ''
        self.tagger: str = ''
        self.message: str = ''

    def serialize(self) -> bytes:
        """Serialize tag to bytes."""
        lines = []
        lines.append(f'object {self.object_sha}')
        lines.append(f'type {self.object_type}')
        lines.append(f'tag {self.tag_name}')
        lines.append(f'tagger {self.tagger}')
        lines.append('')
        lines.append(self.message)
        return '\n'.join(lines).encode()

    @classmethod
    def deserialize(cls, data: bytes) -> 'Tag':
        """Deserialize tag from bytes."""
        tag = cls()
        text = data.decode()
        lines = text.split('\n')

        i = 0
        while i < len(lines) and lines[i]:
            line = lines[i]
            if line.startswith('object '):
                tag.object_sha = line[7:]
            elif line.startswith('type '):
                tag.object_type = line[5:]
            elif line.startswith('tag '):
                tag.tag_name = line[4:]
            elif line.startswith('tagger '):
                tag.tagger = line[7:]
            i += 1

        i += 1
        tag.message = '\n'.join(lines[i:])
        return tag


def read_object(sha: str, repo_root: Optional[Path] = None) -> Tuple[str, bytes]:
    """Read a Git object and return (type, data)."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    obj_path = minigit_dir / 'objects' / sha[:2] / sha[2:]
    if not obj_path.exists():
        raise ValueError(f"Object {sha} not found")

    compressed = obj_path.read_bytes()
    raw = decompress(compressed)

    # Parse header
    null_pos = raw.index(b'\x00')
    header = raw[:null_pos].decode()
    obj_type, size = header.split(' ')
    data = raw[null_pos + 1:]

    return obj_type, data


def write_object(obj_type: str, data: bytes, repo_root: Optional[Path] = None) -> str:
    """Write a Git object and return its SHA."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    # Create object content
    header = f'{obj_type} {len(data)}\x00'.encode()
    content = header + data
    sha = sha1_hash(content)

    # Write to objects directory
    obj_dir = minigit_dir / 'objects' / sha[:2]
    obj_dir.mkdir(parents=True, exist_ok=True)

    obj_path = obj_dir / sha[2:]
    if not obj_path.exists():
        compressed = compress(content)
        obj_path.write_bytes(compressed)

    return sha


def hash_object(data: bytes, obj_type: str = 'blob', write: bool = False,
                repo_root: Optional[Path] = None) -> str:
    """Compute hash of object, optionally writing it."""
    header = f'{obj_type} {len(data)}\x00'.encode()
    content = header + data
    sha = sha1_hash(content)

    if write:
        write_object(obj_type, data, repo_root)

    return sha


def get_object(sha: str, repo_root: Optional[Path] = None) -> GitObject:
    """Read and deserialize a Git object."""
    obj_type, data = read_object(sha, repo_root)

    if obj_type == 'blob':
        return Blob.deserialize(data)
    elif obj_type == 'tree':
        return Tree.deserialize(data)
    elif obj_type == 'commit':
        return Commit.deserialize(data)
    elif obj_type == 'tag':
        return Tag.deserialize(data)
    else:
        raise ValueError(f"Unknown object type: {obj_type}")


def resolve_object(name: str, repo_root: Optional[Path] = None) -> str:
    """Resolve an object name (SHA, ref, etc.) to full SHA."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    # Handle special suffixes like HEAD^{tree}
    if '^{' in name:
        base, suffix = name.split('^{')
        suffix = suffix.rstrip('}')
        base_sha = resolve_object(base, repo_root)

        if suffix == 'tree':
            obj_type, data = read_object(base_sha, repo_root)
            if obj_type == 'commit':
                commit = Commit.deserialize(data)
                return commit.tree_sha
            elif obj_type == 'tree':
                return base_sha
            else:
                raise ValueError(f"Cannot get tree from {obj_type}")
        else:
            raise ValueError(f"Unknown suffix: {suffix}")

    # Handle colon path syntax (HEAD:file.txt)
    if ':' in name:
        ref_part, path_part = name.split(':', 1)
        commit_sha = resolve_object(ref_part, repo_root)
        obj_type, data = read_object(commit_sha, repo_root)

        if obj_type == 'commit':
            commit = Commit.deserialize(data)
            tree_sha = commit.tree_sha
        elif obj_type == 'tree':
            tree_sha = commit_sha
        else:
            raise ValueError(f"Cannot resolve path from {obj_type}")

        return resolve_tree_path(tree_sha, path_part, repo_root)

    # Handle parent syntax (HEAD^ or HEAD~N)
    if '^' in name or '~' in name:
        # Parse the base ref and traverse
        base = name
        steps = []

        while '^' in base or '~' in base:
            if '~' in base:
                idx = base.index('~')
                num_str = ''
                i = idx + 1
                while i < len(base) and base[i].isdigit():
                    num_str += base[i]
                    i += 1
                num = int(num_str) if num_str else 1
                steps.extend([0] * num)  # 0 means first parent
                base = base[:idx] + base[i:]
            elif '^' in base:
                idx = base.index('^')
                num_str = ''
                i = idx + 1
                while i < len(base) and base[i].isdigit():
                    num_str += base[i]
                    i += 1
                num = int(num_str) if num_str else 1
                steps.append(num - 1)  # 0-indexed parent
                base = base[:idx] + base[i:]

        sha = resolve_object(base, repo_root)
        for step in steps:
            obj_type, data = read_object(sha, repo_root)
            if obj_type != 'commit':
                raise ValueError(f"Cannot get parent of non-commit")
            commit = Commit.deserialize(data)
            if step >= len(commit.parents):
                raise ValueError(f"No parent at index {step}")
            sha = commit.parents[step]
        return sha

    # Check if it's a full SHA
    if len(name) == 40 and all(c in '0123456789abcdef' for c in name):
        return name

    # Check if it's an abbreviated SHA
    if len(name) >= 4 and all(c in '0123456789abcdef' for c in name):
        objects_dir = minigit_dir / 'objects'
        prefix_dir = objects_dir / name[:2]
        if prefix_dir.exists():
            for obj_file in prefix_dir.iterdir():
                full_sha = name[:2] + obj_file.name
                if full_sha.startswith(name):
                    return full_sha

    # Check HEAD
    if name == 'HEAD':
        head_path = minigit_dir / 'HEAD'
        if head_path.exists():
            content = head_path.read_text().strip()
            if content.startswith('ref: '):
                ref_path = content[5:]
                ref_file = minigit_dir / ref_path
                if ref_file.exists():
                    return ref_file.read_text().strip()
                else:
                    raise ValueError(f"Reference {ref_path} not found")
            else:
                return content  # Detached HEAD

    # Check refs/heads
    ref_file = minigit_dir / 'refs' / 'heads' / name
    if ref_file.exists():
        return ref_file.read_text().strip()

    # Check refs/tags
    ref_file = minigit_dir / 'refs' / 'tags' / name
    if ref_file.exists():
        content = ref_file.read_text().strip()
        # For annotated tags, dereference to get commit
        try:
            obj_type, data = read_object(content, repo_root)
            if obj_type == 'tag':
                tag = Tag.deserialize(data)
                return tag.object_sha
        except:
            pass
        return content

    # Check refs/
    ref_file = minigit_dir / 'refs' / name
    if ref_file.exists():
        return ref_file.read_text().strip()

    raise ValueError(f"Cannot resolve object: {name}")


def resolve_tree_path(tree_sha: str, path: str, repo_root: Optional[Path] = None) -> str:
    """Resolve a path within a tree to a blob/tree SHA."""
    if repo_root is None:
        repo_root = find_repo_root()

    parts = [p for p in path.split('/') if p]
    current_sha = tree_sha

    for part in parts:
        obj_type, data = read_object(current_sha, repo_root)
        if obj_type != 'tree':
            raise ValueError(f"Not a tree: {current_sha}")

        tree = Tree.deserialize(data)
        found = False
        for entry in tree.entries:
            if entry.name == part:
                current_sha = entry.sha
                found = True
                break

        if not found:
            raise ValueError(f"Path not found: {part}")

    return current_sha
