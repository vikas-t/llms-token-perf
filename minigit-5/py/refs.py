"""Reference management for HEAD, branches, and tags."""

from pathlib import Path
from typing import Optional, List, Tuple
import re

from utils import git_dir, resolve_short_sha, read_object


def read_head(repo_root: Path) -> str:
    """Read HEAD content (either 'ref: refs/...' or a SHA)."""
    head_path = repo_root / '.minigit' / 'HEAD'
    return head_path.read_text().strip()


def write_head(repo_root: Path, content: str):
    """Write to HEAD."""
    head_path = repo_root / '.minigit' / 'HEAD'
    head_path.write_text(content + '\n')


def get_head_ref(repo_root: Path) -> Optional[str]:
    """Get the symbolic ref HEAD points to (e.g., refs/heads/main)."""
    head = read_head(repo_root)
    if head.startswith('ref: '):
        return head[5:]
    return None


def is_head_detached(repo_root: Path) -> bool:
    """Check if HEAD is detached."""
    return get_head_ref(repo_root) is None


def resolve_head(repo_root: Path) -> Optional[str]:
    """Resolve HEAD to a commit SHA."""
    head = read_head(repo_root)
    if head.startswith('ref: '):
        ref_path = head[5:]
        return read_ref(repo_root, ref_path)
    else:
        # Detached HEAD - head is the SHA
        return head


def read_ref(repo_root: Path, ref_path: str) -> Optional[str]:
    """Read a reference file and return the SHA."""
    full_path = repo_root / '.minigit' / ref_path
    if full_path.exists():
        return full_path.read_text().strip()
    return None


def write_ref(repo_root: Path, ref_path: str, sha: str):
    """Write a SHA to a reference file."""
    full_path = repo_root / '.minigit' / ref_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(sha + '\n')


def delete_ref(repo_root: Path, ref_path: str):
    """Delete a reference file."""
    full_path = repo_root / '.minigit' / ref_path
    if full_path.exists():
        full_path.unlink()


def list_branches(repo_root: Path) -> List[str]:
    """List all branch names."""
    heads_dir = repo_root / '.minigit' / 'refs' / 'heads'
    if not heads_dir.exists():
        return []
    return sorted([f.name for f in heads_dir.iterdir() if f.is_file()])


def list_tags(repo_root: Path) -> List[str]:
    """List all tag names."""
    tags_dir = repo_root / '.minigit' / 'refs' / 'tags'
    if not tags_dir.exists():
        return []
    return sorted([f.name for f in tags_dir.iterdir() if f.is_file()])


def get_current_branch(repo_root: Path) -> Optional[str]:
    """Get current branch name or None if detached."""
    ref = get_head_ref(repo_root)
    if ref and ref.startswith('refs/heads/'):
        return ref[11:]
    return None


def resolve_ref(repo_root: Path, ref_name: str) -> Optional[str]:
    """Resolve a ref name to a SHA, trying various paths."""
    # Direct SHA
    if re.match(r'^[0-9a-f]{40}$', ref_name):
        return ref_name

    # Short SHA
    if re.match(r'^[0-9a-f]{4,39}$', ref_name):
        full = resolve_short_sha(ref_name, repo_root)
        if full:
            return full

    # HEAD
    if ref_name == 'HEAD':
        return resolve_head(repo_root)

    # Try refs/heads/<name>
    sha = read_ref(repo_root, f'refs/heads/{ref_name}')
    if sha:
        return sha

    # Try refs/tags/<name>
    sha = read_ref(repo_root, f'refs/tags/{ref_name}')
    if sha:
        # May be annotated tag - resolve to commit
        return resolve_tag_to_commit(repo_root, sha)

    # Try refs/<name>
    sha = read_ref(repo_root, f'refs/{ref_name}')
    if sha:
        return sha

    # Try as direct ref path
    sha = read_ref(repo_root, ref_name)
    if sha:
        return sha

    return None


def resolve_tag_to_commit(repo_root: Path, sha: str) -> str:
    """If SHA is a tag object, resolve to its target commit."""
    try:
        obj_type, _ = read_object(sha, repo_root)
        if obj_type == 'tag':
            from objects import Tag
            tag = Tag.read(sha, repo_root)
            return resolve_tag_to_commit(repo_root, tag.object_sha)
        return sha
    except:
        return sha


def resolve_revision(repo_root: Path, revision: str) -> Optional[str]:
    """Resolve a revision expression to a SHA."""
    # Handle HEAD^{tree}
    if revision.endswith('^{tree}'):
        base = revision[:-7]
        commit_sha = resolve_revision(repo_root, base)
        if commit_sha:
            from objects import Commit
            commit = Commit.read(commit_sha, repo_root)
            return commit.tree_sha
        return None

    # Handle <ref>:<path> for file content
    if ':' in revision and not revision.startswith(':'):
        ref_part, path = revision.split(':', 1)
        commit_sha = resolve_revision(repo_root, ref_part)
        if commit_sha:
            return resolve_path_in_commit(repo_root, commit_sha, path)
        return None

    # Handle parent traversal: HEAD^, HEAD~N
    if '^' in revision or '~' in revision:
        return resolve_parent_syntax(repo_root, revision)

    return resolve_ref(repo_root, revision)


def resolve_parent_syntax(repo_root: Path, revision: str) -> Optional[str]:
    """Resolve parent syntax like HEAD^, HEAD~2."""
    # Split on ^ or ~
    parts = re.split(r'(\^|\~)', revision)

    if not parts:
        return None

    # First part is the base ref
    current = resolve_ref(repo_root, parts[0])
    if not current:
        return None

    i = 1
    while i < len(parts):
        op = parts[i]
        i += 1

        if op == '^':
            # Get parent
            num = 1
            if i < len(parts) and parts[i].isdigit():
                num = int(parts[i])
                i += 1

            from objects import Commit
            commit = Commit.read(current, repo_root)
            if num == 0:
                # ^0 means the commit itself
                pass
            elif len(commit.parents) >= num:
                current = commit.parents[num - 1]
            else:
                return None

        elif op == '~':
            # Ancestor
            num = 1
            if i < len(parts) and parts[i].isdigit():
                num = int(parts[i])
                i += 1

            from objects import Commit
            for _ in range(num):
                commit = Commit.read(current, repo_root)
                if not commit.parents:
                    return None
                current = commit.parents[0]

    return current


def resolve_path_in_commit(repo_root: Path, commit_sha: str, path: str) -> Optional[str]:
    """Resolve a path within a commit to its blob/tree SHA."""
    from objects import Commit, Tree

    commit = Commit.read(commit_sha, repo_root)
    tree_sha = commit.tree_sha

    if not path or path == '':
        return tree_sha

    parts = path.split('/')
    current_sha = tree_sha

    for part in parts:
        if not part:
            continue
        tree = Tree.read(current_sha, repo_root)
        found = False
        for entry in tree.entries:
            if entry.name == part:
                current_sha = entry.sha
                found = True
                break
        if not found:
            return None

    return current_sha


def update_head(repo_root: Path, sha: str):
    """Update HEAD to point to a SHA (either via branch ref or detached)."""
    head_ref = get_head_ref(repo_root)
    if head_ref:
        # Update the branch ref
        write_ref(repo_root, head_ref, sha)
    else:
        # Detached HEAD - update HEAD directly
        write_head(repo_root, sha)
