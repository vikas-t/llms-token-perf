// Reference management (HEAD, branches, tags)

import * as fs from 'fs';
import * as path from 'path';
import { getGitDir, ensureDir } from './utils';
import { readObject, parseCommit, resolveShortSha, objectExists, parseTag } from './objects';

export function getHead(repoRoot?: string): string {
  const gitDir = getGitDir(repoRoot);
  const headPath = path.join(gitDir, 'HEAD');
  return fs.readFileSync(headPath, 'utf-8').trim();
}

export function setHead(value: string, repoRoot?: string): void {
  const gitDir = getGitDir(repoRoot);
  const headPath = path.join(gitDir, 'HEAD');
  fs.writeFileSync(headPath, value + '\n');
}

export function isHeadDetached(repoRoot?: string): boolean {
  const head = getHead(repoRoot);
  return !head.startsWith('ref:');
}

export function getCurrentBranch(repoRoot?: string): string | null {
  const head = getHead(repoRoot);
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5);
    if (ref.startsWith('refs/heads/')) {
      return ref.slice(11);
    }
    return ref;
  }
  return null; // Detached HEAD
}

export function getHeadCommit(repoRoot?: string): string | null {
  const head = getHead(repoRoot);

  if (head.startsWith('ref: ')) {
    const refPath = head.slice(5);
    return readRef(refPath, repoRoot);
  }

  // Detached HEAD - HEAD contains SHA directly
  return head;
}

export function readRef(refPath: string, repoRoot?: string): string | null {
  const gitDir = getGitDir(repoRoot);
  const fullPath = path.join(gitDir, refPath);

  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8').trim();
    // Check if it's a symbolic ref
    if (content.startsWith('ref: ')) {
      return readRef(content.slice(5), repoRoot);
    }
    return content;
  }

  return null;
}

export function writeRef(refPath: string, sha: string, repoRoot?: string): void {
  const gitDir = getGitDir(repoRoot);
  const fullPath = path.join(gitDir, refPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, sha + '\n');
}

export function deleteRef(refPath: string, repoRoot?: string): boolean {
  const gitDir = getGitDir(repoRoot);
  const fullPath = path.join(gitDir, refPath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

export function listBranches(repoRoot?: string): string[] {
  const gitDir = getGitDir(repoRoot);
  const headsDir = path.join(gitDir, 'refs', 'heads');

  if (!fs.existsSync(headsDir)) {
    return [];
  }

  const branches: string[] = [];
  const stack: string[] = [''];

  while (stack.length > 0) {
    const prefix = stack.pop()!;
    const dir = prefix ? path.join(headsDir, prefix) : headsDir;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(name);
      } else {
        branches.push(name);
      }
    }
  }

  return branches.sort();
}

export function listTags(repoRoot?: string): string[] {
  const gitDir = getGitDir(repoRoot);
  const tagsDir = path.join(gitDir, 'refs', 'tags');

  if (!fs.existsSync(tagsDir)) {
    return [];
  }

  const tags: string[] = [];
  const stack: string[] = [''];

  while (stack.length > 0) {
    const prefix = stack.pop()!;
    const dir = prefix ? path.join(tagsDir, prefix) : tagsDir;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(name);
      } else {
        tags.push(name);
      }
    }
  }

  return tags.sort();
}

export function branchExists(name: string, repoRoot?: string): boolean {
  const sha = readRef(`refs/heads/${name}`, repoRoot);
  return sha !== null;
}

export function tagExists(name: string, repoRoot?: string): boolean {
  const sha = readRef(`refs/tags/${name}`, repoRoot);
  return sha !== null;
}

export function createBranch(name: string, sha: string, repoRoot?: string): void {
  writeRef(`refs/heads/${name}`, sha, repoRoot);
}

export function deleteBranch(name: string, repoRoot?: string): boolean {
  return deleteRef(`refs/heads/${name}`, repoRoot);
}

export function createTag(name: string, sha: string, repoRoot?: string): void {
  writeRef(`refs/tags/${name}`, sha, repoRoot);
}

export function deleteTag(name: string, repoRoot?: string): boolean {
  return deleteRef(`refs/tags/${name}`, repoRoot);
}

export function updateHead(sha: string, repoRoot?: string): void {
  const head = getHead(repoRoot);

  if (head.startsWith('ref: ')) {
    const refPath = head.slice(5);
    writeRef(refPath, sha, repoRoot);
  } else {
    // Detached HEAD
    setHead(sha, repoRoot);
  }
}

export function resolveRef(ref: string, repoRoot?: string): string | null {
  // Try to resolve in order:
  // 1. HEAD
  // 2. refs/<ref>
  // 3. refs/tags/<ref>
  // 4. refs/heads/<ref>
  // 5. Short SHA

  if (ref === 'HEAD') {
    return getHeadCommit(repoRoot);
  }

  // Check for special syntax HEAD^ or HEAD~n
  const match = ref.match(/^(.+?)(\^+|~(\d+))?(\^\{(\w+)\})?$/);
  if (match) {
    let base = match[1];
    const carets = match[2];
    const tildeN = match[3] ? parseInt(match[3], 10) : 0;
    const objectType = match[5];

    let sha = resolveBaseRef(base, repoRoot);
    if (!sha) return null;

    // Handle parent traversal
    if (carets) {
      const count = carets.startsWith('^') ? carets.length : tildeN;
      for (let i = 0; i < count; i++) {
        const obj = readObject(sha, repoRoot);
        if (obj.type !== 'commit') {
          return null;
        }
        const commit = parseCommit(obj.content);
        if (commit.parents.length === 0) {
          return null;
        }
        sha = commit.parents[0];
      }
    } else if (tildeN > 0) {
      for (let i = 0; i < tildeN; i++) {
        const obj = readObject(sha, repoRoot);
        if (obj.type !== 'commit') {
          return null;
        }
        const commit = parseCommit(obj.content);
        if (commit.parents.length === 0) {
          return null;
        }
        sha = commit.parents[0];
      }
    }

    // Handle object type suffix
    if (objectType === 'tree') {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'commit') {
        const commit = parseCommit(obj.content);
        sha = commit.tree;
      } else if (obj.type !== 'tree') {
        return null;
      }
    }

    return sha;
  }

  return resolveBaseRef(ref, repoRoot);
}

function resolveBaseRef(ref: string, repoRoot?: string): string | null {
  if (ref === 'HEAD') {
    return getHeadCommit(repoRoot);
  }

  // Try refs/heads/<ref>
  let sha = readRef(`refs/heads/${ref}`, repoRoot);
  if (sha) return sha;

  // Try refs/tags/<ref>
  sha = readRef(`refs/tags/${ref}`, repoRoot);
  if (sha) {
    // Tags might point to tag objects
    if (objectExists(sha, repoRoot)) {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'tag') {
        const tag = parseTag(obj.content);
        return tag.object;
      }
    }
    return sha;
  }

  // Try refs/<ref>
  sha = readRef(`refs/${ref}`, repoRoot);
  if (sha) return sha;

  // Try full ref path
  sha = readRef(ref, repoRoot);
  if (sha) return sha;

  // Try as SHA or short SHA
  if (/^[0-9a-f]+$/.test(ref)) {
    sha = resolveShortSha(ref, repoRoot);
    if (sha) return sha;
  }

  return null;
}

export function getSymbolicRef(ref: string, repoRoot?: string): string | null {
  const gitDir = getGitDir(repoRoot);
  const refPath = path.join(gitDir, ref);

  if (fs.existsSync(refPath)) {
    const content = fs.readFileSync(refPath, 'utf-8').trim();
    if (content.startsWith('ref: ')) {
      return content.slice(5);
    }
  }

  return null;
}

export function setSymbolicRef(ref: string, target: string, repoRoot?: string): void {
  const gitDir = getGitDir(repoRoot);
  const refPath = path.join(gitDir, ref);
  ensureDir(path.dirname(refPath));
  fs.writeFileSync(refPath, `ref: ${target}\n`);
}

export function getCommitMessage(sha: string, repoRoot?: string): string {
  const obj = readObject(sha, repoRoot);
  if (obj.type !== 'commit') {
    throw new Error(`Not a commit: ${sha}`);
  }
  const commit = parseCommit(obj.content);
  return commit.message.split('\n')[0]; // First line only
}
