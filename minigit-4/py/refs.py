"""Reference management for Mini Git - HEAD, branches, tags."""

from pathlib import Path
from typing import Optional, List, Tuple

from utils import find_repo_root, get_minigit_dir


def get_head(repo_root: Optional[Path] = None) -> Tuple[str, bool]:
    """
    Get HEAD reference.
    Returns (ref_or_sha, is_symbolic).
    If symbolic (is_symbolic=True), ref_or_sha is like 'refs/heads/main'.
    If detached (is_symbolic=False), ref_or_sha is a SHA.
    """
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    head_path = minigit_dir / 'HEAD'
    if not head_path.exists():
        return '', False

    content = head_path.read_text().strip()
    if content.startswith('ref: '):
        return content[5:], True
    else:
        return content, False


def set_head(ref_or_sha: str, symbolic: bool = True, repo_root: Optional[Path] = None):
    """Set HEAD to a reference or SHA."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    head_path = minigit_dir / 'HEAD'
    if symbolic:
        head_path.write_text(f'ref: {ref_or_sha}\n')
    else:
        head_path.write_text(f'{ref_or_sha}\n')


def get_current_branch(repo_root: Optional[Path] = None) -> Optional[str]:
    """Get the current branch name, or None if HEAD is detached."""
    ref, is_symbolic = get_head(repo_root)
    if is_symbolic and ref.startswith('refs/heads/'):
        return ref[11:]  # Remove 'refs/heads/' prefix
    return None


def get_ref(ref_name: str, repo_root: Optional[Path] = None) -> Optional[str]:
    """Get the SHA a reference points to."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    # Try direct ref path
    ref_path = minigit_dir / ref_name
    if ref_path.exists() and ref_path.is_file():
        return ref_path.read_text().strip()

    # Try refs/heads
    ref_path = minigit_dir / 'refs' / 'heads' / ref_name
    if ref_path.exists():
        return ref_path.read_text().strip()

    # Try refs/tags
    ref_path = minigit_dir / 'refs' / 'tags' / ref_name
    if ref_path.exists():
        return ref_path.read_text().strip()

    return None


def set_ref(ref_name: str, sha: str, repo_root: Optional[Path] = None):
    """Set a reference to a SHA."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    ref_path = minigit_dir / ref_name
    ref_path.parent.mkdir(parents=True, exist_ok=True)
    ref_path.write_text(f'{sha}\n')


def delete_ref(ref_name: str, repo_root: Optional[Path] = None) -> bool:
    """Delete a reference. Returns True if deleted."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    ref_path = minigit_dir / ref_name
    if ref_path.exists():
        ref_path.unlink()
        return True
    return False


def list_branches(repo_root: Optional[Path] = None) -> List[str]:
    """List all branch names."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    heads_dir = minigit_dir / 'refs' / 'heads'
    if not heads_dir.exists():
        return []

    branches = []
    for ref_file in heads_dir.rglob('*'):
        if ref_file.is_file():
            rel = ref_file.relative_to(heads_dir)
            branches.append(str(rel))
    return sorted(branches)


def list_tags(repo_root: Optional[Path] = None) -> List[str]:
    """List all tag names."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    tags_dir = minigit_dir / 'refs' / 'tags'
    if not tags_dir.exists():
        return []

    tags = []
    for ref_file in tags_dir.rglob('*'):
        if ref_file.is_file():
            rel = ref_file.relative_to(tags_dir)
            tags.append(str(rel))
    return sorted(tags)


def resolve_head(repo_root: Optional[Path] = None) -> Optional[str]:
    """Resolve HEAD to a SHA."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    ref, is_symbolic = get_head(repo_root)
    if not ref:
        return None

    if is_symbolic:
        ref_path = minigit_dir / ref
        if ref_path.exists():
            return ref_path.read_text().strip()
        return None
    else:
        return ref


def update_branch(branch_name: str, sha: str, repo_root: Optional[Path] = None):
    """Update a branch to point to a SHA."""
    set_ref(f'refs/heads/{branch_name}', sha, repo_root)


def create_branch(branch_name: str, sha: str, repo_root: Optional[Path] = None) -> bool:
    """Create a new branch. Returns False if branch already exists."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    ref_path = minigit_dir / 'refs' / 'heads' / branch_name
    if ref_path.exists():
        return False

    ref_path.parent.mkdir(parents=True, exist_ok=True)
    ref_path.write_text(f'{sha}\n')
    return True


def delete_branch(branch_name: str, repo_root: Optional[Path] = None) -> bool:
    """Delete a branch. Returns True if deleted."""
    return delete_ref(f'refs/heads/{branch_name}', repo_root)


def rename_branch(old_name: str, new_name: str, repo_root: Optional[Path] = None) -> bool:
    """Rename a branch. Returns True if successful."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    old_path = minigit_dir / 'refs' / 'heads' / old_name
    new_path = minigit_dir / 'refs' / 'heads' / new_name

    if not old_path.exists():
        return False
    if new_path.exists():
        return False

    sha = old_path.read_text().strip()
    new_path.parent.mkdir(parents=True, exist_ok=True)
    new_path.write_text(f'{sha}\n')
    old_path.unlink()

    # Update HEAD if it points to old branch
    ref, is_symbolic = get_head(repo_root)
    if is_symbolic and ref == f'refs/heads/{old_name}':
        set_head(f'refs/heads/{new_name}', symbolic=True, repo_root=repo_root)

    return True


def create_tag(tag_name: str, sha: str, repo_root: Optional[Path] = None) -> bool:
    """Create a lightweight tag. Returns False if tag exists."""
    if repo_root is None:
        repo_root = find_repo_root()
    minigit_dir = get_minigit_dir(repo_root)

    ref_path = minigit_dir / 'refs' / 'tags' / tag_name
    if ref_path.exists():
        return False

    ref_path.parent.mkdir(parents=True, exist_ok=True)
    ref_path.write_text(f'{sha}\n')
    return True


def delete_tag(tag_name: str, repo_root: Optional[Path] = None) -> bool:
    """Delete a tag. Returns True if deleted."""
    return delete_ref(f'refs/tags/{tag_name}', repo_root)


def is_branch_merged(branch_name: str, into_branch: str = 'main',
                     repo_root: Optional[Path] = None) -> bool:
    """Check if a branch is merged into another branch."""
    if repo_root is None:
        repo_root = find_repo_root()

    branch_sha = get_ref(f'refs/heads/{branch_name}', repo_root)
    into_sha = get_ref(f'refs/heads/{into_branch}', repo_root)

    if not branch_sha or not into_sha:
        return False

    # Check if branch_sha is an ancestor of into_sha
    from objects import read_object, Commit

    visited = set()
    to_visit = [into_sha]

    while to_visit:
        sha = to_visit.pop()
        if sha in visited:
            continue
        visited.add(sha)

        if sha == branch_sha:
            return True

        try:
            obj_type, data = read_object(sha, repo_root)
            if obj_type == 'commit':
                commit = Commit.deserialize(data)
                to_visit.extend(commit.parents)
        except:
            pass

    return False
