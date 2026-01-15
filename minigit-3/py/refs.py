"""Reference management (HEAD, branches, tags) for minigit."""

import os
from pathlib import Path
from typing import Optional


def read_head(repo_root: Path) -> str:
    """Read HEAD and return its content."""
    head_path = repo_root / '.minigit' / 'HEAD'
    if not head_path.exists():
        return 'ref: refs/heads/main'
    return head_path.read_text().strip()


def write_head(repo_root: Path, content: str) -> None:
    """Write content to HEAD."""
    head_path = repo_root / '.minigit' / 'HEAD'
    head_path.write_text(content + '\n')


def is_head_detached(repo_root: Path) -> bool:
    """Check if HEAD is detached (pointing directly to SHA)."""
    head = read_head(repo_root)
    return not head.startswith('ref:')


def get_head_ref(repo_root: Path) -> Optional[str]:
    """Get the ref that HEAD points to, or None if detached."""
    head = read_head(repo_root)
    if head.startswith('ref: '):
        return head[5:]
    return None


def get_head_sha(repo_root: Path) -> Optional[str]:
    """Get the SHA that HEAD points to."""
    head = read_head(repo_root)
    if head.startswith('ref: '):
        ref_path = head[5:]
        return read_ref(repo_root, ref_path)
    else:
        # Detached HEAD - content is the SHA
        return head if len(head) == 40 else None


def read_ref(repo_root: Path, ref_path: str) -> Optional[str]:
    """Read a reference and return its SHA."""
    full_path = repo_root / '.minigit' / ref_path
    if full_path.exists():
        return full_path.read_text().strip()
    return None


def write_ref(repo_root: Path, ref_path: str, sha: str) -> None:
    """Write a SHA to a reference."""
    full_path = repo_root / '.minigit' / ref_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(sha + '\n')


def delete_ref(repo_root: Path, ref_path: str) -> bool:
    """Delete a reference. Returns True if deleted."""
    full_path = repo_root / '.minigit' / ref_path
    if full_path.exists():
        full_path.unlink()
        return True
    return False


def list_refs(repo_root: Path, prefix: str = 'refs/') -> list[tuple[str, str]]:
    """List all refs with given prefix. Returns list of (ref_path, sha)."""
    refs_dir = repo_root / '.minigit' / prefix
    if not refs_dir.exists():
        return []

    result = []
    for ref_file in refs_dir.rglob('*'):
        if ref_file.is_file():
            ref_path = str(ref_file.relative_to(repo_root / '.minigit'))
            sha = ref_file.read_text().strip()
            result.append((ref_path, sha))

    return result


def list_branches(repo_root: Path) -> list[str]:
    """List all branch names."""
    refs = list_refs(repo_root, 'refs/heads/')
    return [r[0].replace('refs/heads/', '') for r in refs]


def list_tags(repo_root: Path) -> list[str]:
    """List all tag names."""
    refs = list_refs(repo_root, 'refs/tags/')
    return [r[0].replace('refs/tags/', '') for r in refs]


def get_current_branch(repo_root: Path) -> Optional[str]:
    """Get the current branch name, or None if detached."""
    ref = get_head_ref(repo_root)
    if ref and ref.startswith('refs/heads/'):
        return ref[11:]
    return None


def resolve_ref(repo_root: Path, name: str) -> Optional[str]:
    """Resolve a ref name to its SHA. Handles HEAD, branches, tags, and SHA."""
    from utils import expand_sha

    # Direct SHA
    if len(name) == 40 and all(c in '0123456789abcdef' for c in name):
        return name

    # Abbreviated SHA
    if len(name) >= 4 and all(c in '0123456789abcdef' for c in name):
        try:
            return expand_sha(repo_root, name)
        except ValueError:
            pass

    # HEAD
    if name == 'HEAD':
        return get_head_sha(repo_root)

    # Handle tree/blob specifiers (must check before parent notation)
    if '^{' in name:
        base, spec = name.split('^{')
        spec = spec.rstrip('}')
        base_sha = resolve_ref(repo_root, base)
        if base_sha is None:
            return None

        if spec == 'tree':
            from objects import read_commit
            try:
                commit = read_commit(repo_root, base_sha)
                return commit['tree']
            except:
                return None
        elif spec == 'commit':
            return base_sha

    # Handle parent/ancestor notation (e.g., HEAD^, HEAD~2)
    if '^' in name or '~' in name:
        return resolve_revision(repo_root, name)

    # Handle path specifier (e.g., HEAD:file.txt)
    if ':' in name:
        ref_part, path = name.split(':', 1)
        ref_sha = resolve_ref(repo_root, ref_part)
        if ref_sha is None:
            return None
        # This returns the blob SHA for the file
        from objects import read_commit, get_tree_entry
        try:
            commit = read_commit(repo_root, ref_sha)
            entry = get_tree_entry(repo_root, commit['tree'], path)
            return entry.sha if entry else None
        except:
            return None

    # Branch
    branch_sha = read_ref(repo_root, f'refs/heads/{name}')
    if branch_sha:
        return branch_sha

    # Tag
    tag_sha = read_ref(repo_root, f'refs/tags/{name}')
    if tag_sha:
        # Check if it's an annotated tag
        from utils import read_object
        try:
            obj_type, _ = read_object(repo_root, tag_sha)
            if obj_type == 'tag':
                from objects import read_tag
                tag = read_tag(repo_root, tag_sha)
                return tag['object']
        except:
            pass
        return tag_sha

    # Full ref path
    sha = read_ref(repo_root, name)
    if sha:
        return sha

    return None


def resolve_revision(repo_root: Path, rev: str) -> Optional[str]:
    """Resolve a revision with ^ or ~ notation."""
    import re

    # Parse the revision
    match = re.match(r'^([^~^]+)((?:[~^]\d*)+)$', rev)
    if not match:
        # No parent notation, just resolve directly
        return resolve_ref(repo_root, rev)

    base, modifiers = match.groups()
    sha = resolve_ref(repo_root, base)
    if sha is None:
        return None

    # Process each modifier
    pos = 0
    while pos < len(modifiers):
        if modifiers[pos] == '^':
            # Get n-th parent (default 1)
            num_match = re.match(r'\^(\d*)', modifiers[pos:])
            n = int(num_match.group(1)) if num_match.group(1) else 1
            pos += len(num_match.group(0))

            if n == 0:
                # ^0 means the commit itself
                continue

            from objects import read_commit
            try:
                commit = read_commit(repo_root, sha)
                if n <= len(commit['parents']):
                    sha = commit['parents'][n - 1]
                else:
                    return None
            except:
                return None

        elif modifiers[pos] == '~':
            # Go back n generations (default 1)
            num_match = re.match(r'~(\d*)', modifiers[pos:])
            n = int(num_match.group(1)) if num_match.group(1) else 1
            pos += len(num_match.group(0))

            from objects import read_commit
            for _ in range(n):
                try:
                    commit = read_commit(repo_root, sha)
                    if commit['parents']:
                        sha = commit['parents'][0]
                    else:
                        return None
                except:
                    return None

    return sha


def update_head_for_commit(repo_root: Path, sha: str) -> None:
    """Update HEAD (or current branch) to point to a new commit."""
    head = read_head(repo_root)
    if head.startswith('ref: '):
        # Update the branch ref
        ref_path = head[5:]
        write_ref(repo_root, ref_path, sha)
    else:
        # Detached HEAD - update HEAD directly
        write_head(repo_root, sha)
