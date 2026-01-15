"""Git object handling: Blob, Tree, Commit, Tag."""

from pathlib import Path
from typing import Optional, List, Tuple
import os

from utils import (
    write_object, read_object, hash_object_data,
    git_dir, resolve_short_sha
)


class Blob:
    """Represents a git blob (file content)."""

    def __init__(self, data: bytes):
        self.data = data
        self._sha: Optional[str] = None

    @property
    def sha(self) -> str:
        if self._sha is None:
            self._sha = hash_object_data('blob', self.data)
        return self._sha

    def write(self, repo_root: Optional[Path] = None) -> str:
        self._sha = write_object('blob', self.data, repo_root)
        return self._sha

    @classmethod
    def read(cls, sha: str, repo_root: Optional[Path] = None) -> 'Blob':
        obj_type, data = read_object(sha, repo_root)
        if obj_type != 'blob':
            raise ValueError(f"Object {sha} is not a blob")
        blob = cls(data)
        blob._sha = sha
        return blob


class TreeEntry:
    """A single entry in a tree object."""

    def __init__(self, mode: int, name: str, sha: str):
        self.mode = mode
        self.name = name
        self.sha = sha

    @property
    def type(self) -> str:
        if self.mode == 0o40000:
            return 'tree'
        else:
            return 'blob'


class Tree:
    """Represents a git tree (directory)."""

    def __init__(self, entries: Optional[List[TreeEntry]] = None):
        self.entries = sorted(entries or [], key=lambda e: e.name)
        self._sha: Optional[str] = None

    def serialize(self) -> bytes:
        """Serialize tree to bytes."""
        result = b''
        for entry in sorted(self.entries, key=lambda e: e.name + ('/' if e.mode == 0o40000 else '')):
            mode_str = f"{entry.mode:o}"
            sha_bytes = bytes.fromhex(entry.sha)
            result += f"{mode_str} {entry.name}\0".encode() + sha_bytes
        return result

    @property
    def sha(self) -> str:
        if self._sha is None:
            self._sha = hash_object_data('tree', self.serialize())
        return self._sha

    def write(self, repo_root: Optional[Path] = None) -> str:
        self._sha = write_object('tree', self.serialize(), repo_root)
        return self._sha

    @classmethod
    def read(cls, sha: str, repo_root: Optional[Path] = None) -> 'Tree':
        obj_type, data = read_object(sha, repo_root)
        if obj_type != 'tree':
            raise ValueError(f"Object {sha} is not a tree")

        entries = []
        i = 0
        while i < len(data):
            # Find space after mode
            space_idx = data.index(b' ', i)
            mode = int(data[i:space_idx].decode(), 8)

            # Find null after name
            null_idx = data.index(b'\0', space_idx)
            name = data[space_idx + 1:null_idx].decode()

            # Next 20 bytes are SHA
            sha_bytes = data[null_idx + 1:null_idx + 21]
            entry_sha = sha_bytes.hex()

            entries.append(TreeEntry(mode, name, entry_sha))
            i = null_idx + 21

        tree = cls(entries)
        tree._sha = sha
        return tree


class Commit:
    """Represents a git commit."""

    def __init__(
        self,
        tree_sha: str,
        parents: List[str],
        author: str,
        author_email: str,
        author_date: str,
        committer: str,
        committer_email: str,
        committer_date: str,
        message: str
    ):
        self.tree_sha = tree_sha
        self.parents = parents
        self.author = author
        self.author_email = author_email
        self.author_date = author_date
        self.committer = committer
        self.committer_email = committer_email
        self.committer_date = committer_date
        self.message = message
        self._sha: Optional[str] = None

    def serialize(self) -> bytes:
        """Serialize commit to bytes."""
        lines = []
        lines.append(f"tree {self.tree_sha}")
        for parent in self.parents:
            lines.append(f"parent {parent}")
        lines.append(f"author {self.author} <{self.author_email}> {self.author_date}")
        lines.append(f"committer {self.committer} <{self.committer_email}> {self.committer_date}")
        lines.append("")
        lines.append(self.message)

        return '\n'.join(lines).encode()

    @property
    def sha(self) -> str:
        if self._sha is None:
            self._sha = hash_object_data('commit', self.serialize())
        return self._sha

    def write(self, repo_root: Optional[Path] = None) -> str:
        self._sha = write_object('commit', self.serialize(), repo_root)
        return self._sha

    @classmethod
    def read(cls, sha: str, repo_root: Optional[Path] = None) -> 'Commit':
        obj_type, data = read_object(sha, repo_root)
        if obj_type != 'commit':
            raise ValueError(f"Object {sha} is not a commit")

        text = data.decode()
        lines = text.split('\n')

        tree_sha = None
        parents = []
        author = author_email = author_date = None
        committer = committer_email = committer_date = None
        message_start = 0

        for i, line in enumerate(lines):
            if line == '':
                message_start = i + 1
                break
            elif line.startswith('tree '):
                tree_sha = line[5:]
            elif line.startswith('parent '):
                parents.append(line[7:])
            elif line.startswith('author '):
                author_info = line[7:]
                author, rest = parse_author_line(author_info)
                author_email = rest[0]
                author_date = rest[1]
            elif line.startswith('committer '):
                committer_info = line[10:]
                committer, rest = parse_author_line(committer_info)
                committer_email = rest[0]
                committer_date = rest[1]

        message = '\n'.join(lines[message_start:])

        commit = cls(
            tree_sha, parents,
            author, author_email, author_date,
            committer, committer_email, committer_date,
            message
        )
        commit._sha = sha
        return commit


def parse_author_line(line: str) -> Tuple[str, Tuple[str, str]]:
    """Parse author/committer line: 'Name <email> timestamp tz'"""
    # Find the < for email start
    lt_idx = line.index('<')
    gt_idx = line.index('>')

    name = line[:lt_idx].strip()
    email = line[lt_idx + 1:gt_idx]
    date_part = line[gt_idx + 1:].strip()

    return name, (email, date_part)


class Tag:
    """Represents an annotated git tag."""

    def __init__(
        self,
        object_sha: str,
        object_type: str,
        tag_name: str,
        tagger: str,
        tagger_email: str,
        tagger_date: str,
        message: str
    ):
        self.object_sha = object_sha
        self.object_type = object_type
        self.tag_name = tag_name
        self.tagger = tagger
        self.tagger_email = tagger_email
        self.tagger_date = tagger_date
        self.message = message
        self._sha: Optional[str] = None

    def serialize(self) -> bytes:
        """Serialize tag to bytes."""
        lines = []
        lines.append(f"object {self.object_sha}")
        lines.append(f"type {self.object_type}")
        lines.append(f"tag {self.tag_name}")
        lines.append(f"tagger {self.tagger} <{self.tagger_email}> {self.tagger_date}")
        lines.append("")
        lines.append(self.message)

        return '\n'.join(lines).encode()

    @property
    def sha(self) -> str:
        if self._sha is None:
            self._sha = hash_object_data('tag', self.serialize())
        return self._sha

    def write(self, repo_root: Optional[Path] = None) -> str:
        self._sha = write_object('tag', self.serialize(), repo_root)
        return self._sha

    @classmethod
    def read(cls, sha: str, repo_root: Optional[Path] = None) -> 'Tag':
        obj_type, data = read_object(sha, repo_root)
        if obj_type != 'tag':
            raise ValueError(f"Object {sha} is not a tag")

        text = data.decode()
        lines = text.split('\n')

        object_sha = None
        tag_object_type = None
        tag_name = None
        tagger = tagger_email = tagger_date = None
        message_start = 0

        for i, line in enumerate(lines):
            if line == '':
                message_start = i + 1
                break
            elif line.startswith('object '):
                object_sha = line[7:]
            elif line.startswith('type '):
                tag_object_type = line[5:]
            elif line.startswith('tag '):
                tag_name = line[4:]
            elif line.startswith('tagger '):
                tagger_info = line[7:]
                tagger, rest = parse_author_line(tagger_info)
                tagger_email = rest[0]
                tagger_date = rest[1]

        message = '\n'.join(lines[message_start:])

        tag = cls(
            object_sha, tag_object_type, tag_name,
            tagger, tagger_email, tagger_date,
            message
        )
        tag._sha = sha
        return tag
