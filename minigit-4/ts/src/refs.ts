// Reference management (HEAD, branches, tags)

import * as fs from 'fs';
import * as path from 'path';
import { getHeadPath, getHeadsDir, getTagsDir, getRefsDir, getMinigitDir, ensureDir } from './utils';
import { objectExists, resolveShortSha, readObject, parseCommitContent, parseTagContent } from './objects';

export function readHead(repoRoot: string): string {
  const headPath = getHeadPath(repoRoot);
  return fs.readFileSync(headPath, 'utf-8').trim();
}

export function writeHead(repoRoot: string, content: string): void {
  const headPath = getHeadPath(repoRoot);
  fs.writeFileSync(headPath, content + '\n');
}

export function isDetachedHead(repoRoot: string): boolean {
  const head = readHead(repoRoot);
  return !head.startsWith('ref:');
}

export function getCurrentBranch(repoRoot: string): string | null {
  const head = readHead(repoRoot);
  if (head.startsWith('ref: refs/heads/')) {
    return head.slice('ref: refs/heads/'.length);
  }
  return null;
}

export function getHeadCommit(repoRoot: string): string | null {
  return resolveRef(repoRoot, 'HEAD');
}

export function resolveRef(repoRoot: string, ref: string): string | null {
  // Handle special refs
  if (ref === 'HEAD') {
    const head = readHead(repoRoot);
    if (head.startsWith('ref: ')) {
      return resolveRef(repoRoot, head.slice(5));
    }
    // Detached HEAD - direct SHA
    if (/^[0-9a-f]{40}$/.test(head)) {
      return head;
    }
    return null;
  }

  // Handle refs/heads/xxx or refs/tags/xxx
  if (ref.startsWith('refs/')) {
    const refPath = path.join(getMinigitDir(repoRoot), ref);
    if (fs.existsSync(refPath)) {
      const sha = fs.readFileSync(refPath, 'utf-8').trim();
      // Handle symbolic refs
      if (sha.startsWith('ref: ')) {
        return resolveRef(repoRoot, sha.slice(5));
      }
      return sha;
    }
    return null;
  }

  // Try branches
  const branchPath = path.join(getHeadsDir(repoRoot), ref);
  if (fs.existsSync(branchPath)) {
    return fs.readFileSync(branchPath, 'utf-8').trim();
  }

  // Try tags
  const tagPath = path.join(getTagsDir(repoRoot), ref);
  if (fs.existsSync(tagPath)) {
    const sha = fs.readFileSync(tagPath, 'utf-8').trim();
    // Tag might point to annotated tag object
    if (objectExists(repoRoot, sha)) {
      const { type, content } = readObject(repoRoot, sha);
      if (type === 'tag') {
        const tagInfo = parseTagContent(content);
        return tagInfo.object;
      }
    }
    return sha;
  }

  // Try as SHA
  const resolved = resolveShortSha(repoRoot, ref);
  if (resolved) {
    return resolved;
  }

  return null;
}

export function resolveRevision(repoRoot: string, rev: string): string | null {
  // Handle commit^{tree} syntax
  if (rev.endsWith('^{tree}')) {
    const commitRef = rev.slice(0, -7);
    const commitSha = resolveRevision(repoRoot, commitRef);
    if (!commitSha) return null;

    const { type, content } = readObject(repoRoot, commitSha);
    if (type === 'commit') {
      const commitInfo = parseCommitContent(content);
      return commitInfo.tree;
    }
    return null;
  }

  // Handle HEAD:path or ref:path syntax
  if (rev.includes(':')) {
    const [refPart, pathPart] = rev.split(':');
    const commitSha = resolveRevision(repoRoot, refPart);
    if (!commitSha) return null;

    return resolvePathInCommit(repoRoot, commitSha, pathPart);
  }

  // Handle parent references (^ and ~)
  const parentMatch = rev.match(/^(.+?)(\^+|~(\d+))$/);
  if (parentMatch) {
    const base = parentMatch[1];
    const baseSha = resolveRevision(repoRoot, base);
    if (!baseSha) return null;

    if (parentMatch[2].startsWith('^')) {
      // Each ^ goes to first parent
      let sha = baseSha;
      for (let i = 0; i < parentMatch[2].length; i++) {
        const parent = getParent(repoRoot, sha, 0);
        if (!parent) return null;
        sha = parent;
      }
      return sha;
    } else {
      // ~N goes N parents back
      const count = parseInt(parentMatch[3], 10);
      let sha = baseSha;
      for (let i = 0; i < count; i++) {
        const parent = getParent(repoRoot, sha, 0);
        if (!parent) return null;
        sha = parent;
      }
      return sha;
    }
  }

  // Regular ref resolution
  return resolveRef(repoRoot, rev);
}

function getParent(repoRoot: string, sha: string, index: number): string | null {
  if (!objectExists(repoRoot, sha)) return null;

  const { type, content } = readObject(repoRoot, sha);
  if (type !== 'commit') return null;

  const commitInfo = parseCommitContent(content);
  if (index < commitInfo.parents.length) {
    return commitInfo.parents[index];
  }
  return null;
}

function resolvePathInCommit(repoRoot: string, commitSha: string, filePath: string): string | null {
  const { type, content } = readObject(repoRoot, commitSha);
  if (type !== 'commit') return null;

  const commitInfo = parseCommitContent(content);
  return resolvePathInTree(repoRoot, commitInfo.tree, filePath);
}

function resolvePathInTree(repoRoot: string, treeSha: string, filePath: string): string | null {
  const parts = filePath.split('/').filter((p) => p);
  let currentSha = treeSha;

  for (let i = 0; i < parts.length; i++) {
    const { type, content } = readObject(repoRoot, currentSha);
    if (type !== 'tree') return null;

    const { parseTreeContent } = require('./objects');
    const entries = parseTreeContent(content);
    const entry = entries.find((e: { name: string }) => e.name === parts[i]);

    if (!entry) return null;
    currentSha = entry.sha;
  }

  return currentSha;
}

export function updateBranch(repoRoot: string, branchName: string, sha: string): void {
  const branchPath = path.join(getHeadsDir(repoRoot), branchName);
  ensureDir(path.dirname(branchPath));
  fs.writeFileSync(branchPath, sha + '\n');
}

export function deleteBranch(repoRoot: string, branchName: string): boolean {
  const branchPath = path.join(getHeadsDir(repoRoot), branchName);
  if (fs.existsSync(branchPath)) {
    fs.unlinkSync(branchPath);
    return true;
  }
  return false;
}

export function branchExists(repoRoot: string, branchName: string): boolean {
  const branchPath = path.join(getHeadsDir(repoRoot), branchName);
  return fs.existsSync(branchPath);
}

export function getBranches(repoRoot: string): string[] {
  const headsDir = getHeadsDir(repoRoot);
  if (!fs.existsSync(headsDir)) {
    return [];
  }

  const branches: string[] = [];
  readBranchesRecursive(headsDir, '', branches);
  return branches.sort();
}

function readBranchesRecursive(dir: string, prefix: string, branches: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      readBranchesRecursive(path.join(dir, entry.name), name, branches);
    } else if (entry.isFile()) {
      branches.push(name);
    }
  }
}

export function createTag(repoRoot: string, tagName: string, sha: string): void {
  const tagPath = path.join(getTagsDir(repoRoot), tagName);
  ensureDir(path.dirname(tagPath));
  fs.writeFileSync(tagPath, sha + '\n');
}

export function deleteTag(repoRoot: string, tagName: string): boolean {
  const tagPath = path.join(getTagsDir(repoRoot), tagName);
  if (fs.existsSync(tagPath)) {
    fs.unlinkSync(tagPath);
    return true;
  }
  return false;
}

export function tagExists(repoRoot: string, tagName: string): boolean {
  const tagPath = path.join(getTagsDir(repoRoot), tagName);
  return fs.existsSync(tagPath);
}

export function getTags(repoRoot: string): string[] {
  const tagsDir = getTagsDir(repoRoot);
  if (!fs.existsSync(tagsDir)) {
    return [];
  }

  const tags: string[] = [];
  const entries = fs.readdirSync(tagsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      tags.push(entry.name);
    }
  }
  return tags.sort();
}

export function updateRef(repoRoot: string, refPath: string, sha: string): void {
  const fullPath = path.join(getMinigitDir(repoRoot), refPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, sha + '\n');
}

export function readRef(repoRoot: string, refPath: string): string | null {
  const fullPath = path.join(getMinigitDir(repoRoot), refPath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf-8').trim();
  }
  return null;
}

export function writeSymbolicRef(repoRoot: string, name: string, target: string): void {
  const refPath = name === 'HEAD' ? getHeadPath(repoRoot) : path.join(getMinigitDir(repoRoot), name);
  fs.writeFileSync(refPath, `ref: ${target}\n`);
}

export function readSymbolicRef(repoRoot: string, name: string): string | null {
  const refPath = name === 'HEAD' ? getHeadPath(repoRoot) : path.join(getMinigitDir(repoRoot), name);
  if (!fs.existsSync(refPath)) {
    return null;
  }

  const content = fs.readFileSync(refPath, 'utf-8').trim();
  if (content.startsWith('ref: ')) {
    return content.slice(5);
  }
  return null;
}
