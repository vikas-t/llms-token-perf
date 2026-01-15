// checkout command - Switch branches or restore files

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePathSeparator, ensureDir } from '../utils';
import { readIndex, writeIndex, createIndexEntryFromFile } from '../index-file';
import { readObject, parseCommitContent, parseTreeContent, createBlobContent, hashObject, objectExists } from '../objects';
import {
  resolveRevision,
  resolveRef,
  branchExists,
  updateBranch,
  writeHead,
  writeSymbolicRef,
  getHeadCommit,
  getCurrentBranch,
} from '../refs';
import { IndexEntry } from '../types';

export function checkout(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let createBranch = false;
  const positional: string[] = [];
  let inPathSpec = false;
  const pathSpecs: string[] = [];

  for (const arg of args) {
    if (arg === '-b') {
      createBranch = true;
    } else if (arg === '--') {
      inPathSpec = true;
    } else if (inPathSpec) {
      pathSpecs.push(arg);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // checkout -- <paths> : restore files from index
  if (pathSpecs.length > 0) {
    const commit = positional.length > 0 ? positional[0] : null;
    return restoreFiles(repoRoot, commit, pathSpecs);
  }

  // checkout -b <branch> [start-point]
  if (createBranch) {
    if (positional.length === 0) {
      console.error('fatal: branch name required');
      return 1;
    }
    const branchName = positional[0];
    const startPoint = positional[1];
    return createAndCheckoutBranch(repoRoot, branchName, startPoint);
  }

  // checkout <branch|commit>
  if (positional.length === 0) {
    console.error('fatal: checkout requires a branch name or commit');
    return 1;
  }

  const target = positional[0];

  // Check if it's a branch
  if (branchExists(repoRoot, target)) {
    return checkoutBranch(repoRoot, target);
  }

  // Try to resolve as commit
  const sha = resolveRevision(repoRoot, target);
  if (sha) {
    return checkoutDetached(repoRoot, sha);
  }

  console.error(`error: pathspec '${target}' did not match any file(s) known to git`);
  return 1;
}

function checkoutBranch(repoRoot: string, branchName: string): number {
  const sha = resolveRef(repoRoot, branchName);
  if (!sha) {
    console.error(`error: branch '${branchName}' not found`);
    return 1;
  }

  // Check for uncommitted changes that would be overwritten
  if (!canSafelyCheckout(repoRoot, sha)) {
    console.error('error: Your local changes to the following files would be overwritten by checkout');
    console.error('Please commit your changes or stash them before you switch branches.');
    return 1;
  }

  // Update working tree and index
  updateWorkingTree(repoRoot, sha);

  // Update HEAD
  writeSymbolicRef(repoRoot, 'HEAD', `refs/heads/${branchName}`);

  console.log(`Switched to branch '${branchName}'`);
  return 0;
}

function checkoutDetached(repoRoot: string, sha: string): number {
  // Check for uncommitted changes that would be overwritten
  if (!canSafelyCheckout(repoRoot, sha)) {
    console.error('error: Your local changes to the following files would be overwritten by checkout');
    console.error('Please commit your changes or stash them before you switch branches.');
    return 1;
  }

  // Update working tree and index
  updateWorkingTree(repoRoot, sha);

  // Update HEAD to detached state
  writeHead(repoRoot, sha);

  console.log(`HEAD is now at ${sha.slice(0, 7)}`);
  return 0;
}

function createAndCheckoutBranch(repoRoot: string, branchName: string, startPoint?: string): number {
  // Check if branch already exists
  if (branchExists(repoRoot, branchName)) {
    console.error(`fatal: branch '${branchName}' already exists`);
    return 1;
  }

  // Resolve start point
  let sha: string | null;
  if (startPoint) {
    sha = resolveRevision(repoRoot, startPoint);
    if (!sha) {
      console.error(`fatal: not a valid object name: '${startPoint}'`);
      return 1;
    }
  } else {
    sha = getHeadCommit(repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      return 1;
    }
  }

  // Check for uncommitted changes that would be overwritten
  if (!canSafelyCheckout(repoRoot, sha)) {
    console.error('error: Your local changes to the following files would be overwritten by checkout');
    return 1;
  }

  // Create branch
  updateBranch(repoRoot, branchName, sha);

  // Update working tree if start point is different from current
  const currentSha = getHeadCommit(repoRoot);
  if (currentSha !== sha) {
    updateWorkingTree(repoRoot, sha);
  }

  // Update HEAD
  writeSymbolicRef(repoRoot, 'HEAD', `refs/heads/${branchName}`);

  console.log(`Switched to a new branch '${branchName}'`);
  return 0;
}

function restoreFiles(repoRoot: string, commit: string | null, paths: string[]): number {
  let entries = readIndex(repoRoot);

  for (const pathSpec of paths) {
    const relativePath = normalizePathSeparator(pathSpec);

    if (commit) {
      // Restore from commit
      const sha = resolveRevision(repoRoot, commit);
      if (!sha) {
        console.error(`error: pathspec '${commit}' did not match any known ref`);
        return 1;
      }

      const { content } = readObject(repoRoot, sha);
      const commitInfo = parseCommitContent(content);
      const fileContent = getFileFromTree(repoRoot, commitInfo.tree, relativePath);

      if (fileContent === null) {
        console.error(`error: pathspec '${pathSpec}' did not match any file(s) known to git`);
        return 1;
      }

      // Write to working tree
      const fullPath = path.join(repoRoot, relativePath);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, fileContent);
    } else {
      // Restore from index
      const entry = entries.find((e) => e.name === relativePath);
      if (!entry) {
        console.error(`error: pathspec '${pathSpec}' did not match any file(s) known to git`);
        return 1;
      }

      const { content } = readObject(repoRoot, entry.sha);
      const fullPath = path.join(repoRoot, relativePath);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, content);
    }
  }

  return 0;
}

function canSafelyCheckout(repoRoot: string, targetSha: string): boolean {
  const entries = readIndex(repoRoot);
  const currentHead = getHeadCommit(repoRoot);

  // Get target tree files
  const targetFiles = new Map<string, string>();
  const { content } = readObject(repoRoot, targetSha);
  const commitInfo = parseCommitContent(content);
  collectTreeFiles(repoRoot, commitInfo.tree, '', targetFiles);

  // Get current tree files
  const currentFiles = new Map<string, string>();
  if (currentHead) {
    const { content: currentContent } = readObject(repoRoot, currentHead);
    const currentCommitInfo = parseCommitContent(currentContent);
    collectTreeFiles(repoRoot, currentCommitInfo.tree, '', currentFiles);
  }

  // Check for uncommitted changes that would be overwritten
  for (const entry of entries) {
    const fullPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(fullPath)) {
      // File is deleted in working tree
      continue;
    }

    const targetSha = targetFiles.get(entry.name);
    const currentSha = currentFiles.get(entry.name);

    // If target differs from current and working tree differs from index
    if (targetSha !== currentSha) {
      // Check if working tree matches index
      const stat = fs.lstatSync(fullPath);
      let content: Buffer;

      if (stat.isSymbolicLink()) {
        content = Buffer.from(fs.readlinkSync(fullPath));
      } else {
        content = fs.readFileSync(fullPath);
      }

      const blobContent = createBlobContent(content);
      const workingSha = hashObject(blobContent);

      if (workingSha !== entry.sha) {
        // Working tree has changes that would be lost
        return false;
      }
    }
  }

  return true;
}

function updateWorkingTree(repoRoot: string, sha: string): void {
  const entries = readIndex(repoRoot);

  // Get current tree files
  const currentHead = getHeadCommit(repoRoot);
  const currentFiles = new Set<string>();
  if (currentHead) {
    const { content } = readObject(repoRoot, currentHead);
    const commitInfo = parseCommitContent(content);
    collectTreeFilesSet(repoRoot, commitInfo.tree, '', currentFiles);
  }

  // Get target tree files
  const { content } = readObject(repoRoot, sha);
  const commitInfo = parseCommitContent(content);
  const targetFiles = new Map<string, { sha: string; mode: string }>();
  collectTreeFilesWithMode(repoRoot, commitInfo.tree, '', targetFiles);

  // Remove files that are in current but not in target
  for (const file of currentFiles) {
    if (!targetFiles.has(file)) {
      const fullPath = path.join(repoRoot, file);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        // Remove empty parent directories
        removeEmptyDirs(repoRoot, path.dirname(fullPath));
      }
    }
  }

  // Update/create files from target
  const newEntries: IndexEntry[] = [];

  for (const [name, { sha: fileSha, mode }] of targetFiles) {
    const fullPath = path.join(repoRoot, name);
    ensureDir(path.dirname(fullPath));

    const { content } = readObject(repoRoot, fileSha);

    if (mode === '120000') {
      // Symlink
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      fs.symlinkSync(content.toString(), fullPath);
    } else {
      fs.writeFileSync(fullPath, content);
      if (mode === '100755') {
        fs.chmodSync(fullPath, 0o755);
      }
    }

    // Create index entry
    const stat = fs.lstatSync(fullPath);
    newEntries.push({
      ctimeSec: Math.floor(stat.ctimeMs / 1000),
      ctimeNsec: Math.floor((stat.ctimeMs % 1000) * 1000000),
      mtimeSec: Math.floor(stat.mtimeMs / 1000),
      mtimeNsec: Math.floor((stat.mtimeMs % 1000) * 1000000),
      dev: stat.dev,
      ino: stat.ino,
      mode: parseInt(mode, 8),
      uid: stat.uid,
      gid: stat.gid,
      size: stat.size,
      sha: fileSha,
      flags: 0,
      name,
    });
  }

  writeIndex(repoRoot, newEntries);
}

function collectTreeFiles(repoRoot: string, treeSha: string, prefix: string, files: Map<string, string>): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      collectTreeFiles(repoRoot, entry.sha, fullName, files);
    } else {
      files.set(fullName, entry.sha);
    }
  }
}

function collectTreeFilesSet(repoRoot: string, treeSha: string, prefix: string, files: Set<string>): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      collectTreeFilesSet(repoRoot, entry.sha, fullName, files);
    } else {
      files.add(fullName);
    }
  }
}

function collectTreeFilesWithMode(
  repoRoot: string,
  treeSha: string,
  prefix: string,
  files: Map<string, { sha: string; mode: string }>
): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      collectTreeFilesWithMode(repoRoot, entry.sha, fullName, files);
    } else {
      files.set(fullName, { sha: entry.sha, mode: entry.mode });
    }
  }
}

function getFileFromTree(repoRoot: string, treeSha: string, filePath: string): Buffer | null {
  const parts = filePath.split('/').filter((p) => p);
  let currentSha = treeSha;

  for (let i = 0; i < parts.length; i++) {
    const { content } = readObject(repoRoot, currentSha);
    const entries = parseTreeContent(content);
    const entry = entries.find((e) => e.name === parts[i]);

    if (!entry) {
      return null;
    }

    currentSha = entry.sha;
  }

  const { type, content } = readObject(repoRoot, currentSha);
  if (type !== 'blob') {
    return null;
  }

  return content;
}

function removeEmptyDirs(repoRoot: string, dirPath: string): void {
  while (dirPath !== repoRoot && dirPath.startsWith(repoRoot)) {
    try {
      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0) {
        fs.rmdirSync(dirPath);
        dirPath = path.dirname(dirPath);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}
