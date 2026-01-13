// Reference management (HEAD, branches, tags)

import * as fs from 'fs';
import * as path from 'path';
import { getMinigitDir, ensureDir } from './utils';
import { expandShortSha, getCommit, readObject, getTreeFromTreeIsh, parseTag } from './objects';

export function getHead(repoRoot?: string): string {
  const minigitDir = getMinigitDir(repoRoot);
  const headPath = path.join(minigitDir, 'HEAD');
  return fs.readFileSync(headPath, 'utf8').trim();
}

export function setHead(value: string, repoRoot?: string): void {
  const minigitDir = getMinigitDir(repoRoot);
  const headPath = path.join(minigitDir, 'HEAD');
  fs.writeFileSync(headPath, value + '\n');
}

export function isDetachedHead(repoRoot?: string): boolean {
  const head = getHead(repoRoot);
  return !head.startsWith('ref:');
}

export function getCurrentBranch(repoRoot?: string): string | null {
  const head = getHead(repoRoot);
  if (head.startsWith('ref:')) {
    const ref = head.slice(5).trim();
    if (ref.startsWith('refs/heads/')) {
      return ref.slice(11);
    }
    return ref;
  }
  return null; // Detached HEAD
}

export function getHeadCommit(repoRoot?: string): string | null {
  const head = getHead(repoRoot);

  if (head.startsWith('ref:')) {
    const ref = head.slice(5).trim();
    return resolveRef(ref, repoRoot);
  }

  // Detached HEAD - head is the SHA
  return head;
}

export function resolveRef(ref: string, repoRoot?: string): string | null {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);

  if (fs.existsSync(refPath)) {
    const content = fs.readFileSync(refPath, 'utf8').trim();
    // Could be a symbolic ref or a SHA
    if (content.startsWith('ref:')) {
      return resolveRef(content.slice(5).trim(), repoRoot);
    }
    return content;
  }

  return null;
}

export function updateRef(ref: string, sha: string, repoRoot?: string): void {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);
  ensureDir(path.dirname(refPath));
  fs.writeFileSync(refPath, sha + '\n');
}

export function deleteRef(ref: string, repoRoot?: string): boolean {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);

  if (fs.existsSync(refPath)) {
    fs.unlinkSync(refPath);
    return true;
  }

  return false;
}

export function refExists(ref: string, repoRoot?: string): boolean {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);
  return fs.existsSync(refPath);
}

export function createBranch(name: string, sha: string, repoRoot?: string): void {
  const ref = `refs/heads/${name}`;
  if (refExists(ref, repoRoot)) {
    throw new Error(`A branch named '${name}' already exists.`);
  }
  updateRef(ref, sha, repoRoot);
}

export function deleteBranch(name: string, repoRoot?: string): void {
  const ref = `refs/heads/${name}`;
  if (!deleteRef(ref, repoRoot)) {
    throw new Error(`Branch '${name}' not found.`);
  }
}

export function renameBranch(oldName: string, newName: string, repoRoot?: string): void {
  const oldRef = `refs/heads/${oldName}`;
  const newRef = `refs/heads/${newName}`;

  const sha = resolveRef(oldRef, repoRoot);
  if (!sha) {
    throw new Error(`Branch '${oldName}' not found.`);
  }

  if (refExists(newRef, repoRoot)) {
    throw new Error(`A branch named '${newName}' already exists.`);
  }

  updateRef(newRef, sha, repoRoot);
  deleteRef(oldRef, repoRoot);

  // Update HEAD if we renamed the current branch
  const head = getHead(repoRoot);
  if (head === `ref: ${oldRef}`) {
    setHead(`ref: ${newRef}`, repoRoot);
  }
}

export function listBranches(repoRoot?: string): string[] {
  const minigitDir = getMinigitDir(repoRoot);
  const headsDir = path.join(minigitDir, 'refs', 'heads');

  if (!fs.existsSync(headsDir)) {
    return [];
  }

  return listRefsRecursive(headsDir, '');
}

function listRefsRecursive(baseDir: string, prefix: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...listRefsRecursive(path.join(baseDir, entry.name), name));
    } else {
      result.push(name);
    }
  }

  return result;
}

export function createTag(name: string, sha: string, repoRoot?: string): void {
  const ref = `refs/tags/${name}`;
  if (refExists(ref, repoRoot)) {
    throw new Error(`Tag '${name}' already exists.`);
  }
  updateRef(ref, sha, repoRoot);
}

export function deleteTag(name: string, repoRoot?: string): void {
  const ref = `refs/tags/${name}`;
  if (!deleteRef(ref, repoRoot)) {
    throw new Error(`Tag '${name}' not found.`);
  }
}

export function listTags(repoRoot?: string): string[] {
  const minigitDir = getMinigitDir(repoRoot);
  const tagsDir = path.join(minigitDir, 'refs', 'tags');

  if (!fs.existsSync(tagsDir)) {
    return [];
  }

  return listRefsRecursive(tagsDir, '');
}

// Resolve a revision to a commit SHA
export function resolveRevision(revision: string, repoRoot?: string): string {
  // Handle special suffixes
  const treeMatch = revision.match(/^(.+)\^\{tree\}$/);
  if (treeMatch) {
    const baseSha = resolveRevision(treeMatch[1], repoRoot);
    return getTreeFromTreeIsh(baseSha, repoRoot);
  }

  // Handle colon path syntax (e.g., HEAD:file.txt)
  const colonMatch = revision.match(/^(.+):(.+)$/);
  if (colonMatch) {
    const baseSha = resolveRevision(colonMatch[1], repoRoot);
    return resolvePathInTree(baseSha, colonMatch[2], repoRoot);
  }

  // Handle parent traversal
  const parentMatch = revision.match(/^(.+)\^(\d*)$/);
  if (parentMatch) {
    const baseSha = resolveRevision(parentMatch[1], repoRoot);
    const parentNum = parentMatch[2] ? parseInt(parentMatch[2], 10) : 1;
    return getParent(baseSha, parentNum, repoRoot);
  }

  // Handle ancestor traversal (HEAD~2)
  const ancestorMatch = revision.match(/^(.+)~(\d+)$/);
  if (ancestorMatch) {
    let sha = resolveRevision(ancestorMatch[1], repoRoot);
    const count = parseInt(ancestorMatch[2], 10);
    for (let i = 0; i < count; i++) {
      sha = getParent(sha, 1, repoRoot);
    }
    return sha;
  }

  // Handle HEAD
  if (revision === 'HEAD') {
    const sha = getHeadCommit(repoRoot);
    if (!sha) {
      throw new Error('HEAD does not point to a commit');
    }
    return sha;
  }

  // Try as branch name
  const branchSha = resolveRef(`refs/heads/${revision}`, repoRoot);
  if (branchSha) {
    return branchSha;
  }

  // Try as tag name
  const tagSha = resolveRef(`refs/tags/${revision}`, repoRoot);
  if (tagSha) {
    // If tag points to a tag object, resolve to the commit
    try {
      const { type, content } = readObject(tagSha, repoRoot);
      if (type === 'tag') {
        const tag = parseTag(content);
        return tag.object;
      }
    } catch {
      // Not a valid object, ignore
    }
    return tagSha;
  }

  // Try as SHA (full or abbreviated)
  try {
    return expandShortSha(revision, repoRoot);
  } catch {
    throw new Error(`Unknown revision: ${revision}`);
  }
}

function getParent(sha: string, parentNum: number, repoRoot?: string): string {
  const commit = getCommit(sha, repoRoot);
  if (parentNum < 1 || parentNum > commit.parents.length) {
    throw new Error(`Commit ${sha.slice(0, 7)} has no parent ${parentNum}`);
  }
  return commit.parents[parentNum - 1];
}

function resolvePathInTree(commitOrTreeSha: string, filePath: string, repoRoot?: string): string {
  const { getTree, readObject } = require('./objects');
  const { type, content } = readObject(commitOrTreeSha, repoRoot);

  let treeSha: string;
  if (type === 'commit') {
    const { parseCommit } = require('./objects');
    const commit = parseCommit(content);
    treeSha = commit.tree;
  } else if (type === 'tree') {
    treeSha = commitOrTreeSha;
  } else {
    throw new Error(`Cannot resolve path in ${type}`);
  }

  const parts = filePath.split('/');
  let currentTreeSha = treeSha;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const entries = getTree(currentTreeSha, repoRoot);
    const entry = entries.find((e: any) => e.name === part);

    if (!entry) {
      throw new Error(`Path '${filePath}' does not exist`);
    }

    if (i === parts.length - 1) {
      return entry.sha;
    }

    if (entry.mode !== '40000') {
      throw new Error(`'${parts.slice(0, i + 1).join('/')}' is not a directory`);
    }

    currentTreeSha = entry.sha;
  }

  return currentTreeSha;
}

export function getSymbolicRef(ref: string, repoRoot?: string): string | null {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);

  if (!fs.existsSync(refPath)) {
    return null;
  }

  const content = fs.readFileSync(refPath, 'utf8').trim();
  if (content.startsWith('ref:')) {
    return content.slice(5).trim();
  }

  return null;
}

export function setSymbolicRef(ref: string, target: string, repoRoot?: string): void {
  const minigitDir = getMinigitDir(repoRoot);
  const refPath = path.join(minigitDir, ref);
  ensureDir(path.dirname(refPath));
  fs.writeFileSync(refPath, `ref: ${target}\n`);
}
