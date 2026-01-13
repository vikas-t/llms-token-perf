// commit command - Create a new commit

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, formatAuthorDate, getAuthorInfo, getCommitterInfo, normalizePath, getFileMode } from '../utils';
import { createCommit, createTree, getTreeFromTreeIsh, walkTree, createBlob } from '../objects';
import { readIndex, writeIndex, buildTreeFromIndex } from '../index-file';
import { getHeadCommit, getCurrentBranch, updateRef, setHead, isDetachedHead } from '../refs';
import { TreeEntry, IndexEntry } from '../types';

export function commit(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let message: string | null = null;
  let amend = false;
  let autoStage = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-m' && i + 1 < args.length) {
      message = args[i + 1];
      i++;
    } else if (arg === '--amend') {
      amend = true;
    } else if (arg === '-a') {
      autoStage = true;
    }
  }

  if (!message && !amend) {
    console.error('error: must provide commit message with -m');
    return 1;
  }

  // Auto-stage modified tracked files if -a flag
  if (autoStage) {
    const headSha = getHeadCommit(repoRoot);
    if (headSha) {
      try {
        const treeSha = getTreeFromTreeIsh(headSha, repoRoot);
        const trackedFiles = walkTree(treeSha, '', repoRoot);
        const index = readIndex(repoRoot);

        for (const [filePath] of trackedFiles) {
          const fullPath = path.join(repoRoot, filePath);
          if (fs.existsSync(fullPath)) {
            const stats = fs.lstatSync(fullPath);
            if (!stats.isDirectory()) {
              const content = stats.isSymbolicLink()
                ? Buffer.from(fs.readlinkSync(fullPath))
                : fs.readFileSync(fullPath);
              const sha = createBlob(content, true, repoRoot);
              const mode = getFileMode(fullPath);

              const existingIdx = index.entries.findIndex(e => e.path === filePath);
              const entry: IndexEntry = {
                ctimeSec: Math.floor(stats.ctimeMs / 1000),
                ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
                mtimeSec: Math.floor(stats.mtimeMs / 1000),
                mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
                dev: stats.dev,
                ino: stats.ino,
                mode,
                uid: stats.uid,
                gid: stats.gid,
                size: stats.size,
                sha,
                flags: Math.min(filePath.length, 0xfff),
                path: filePath,
              };

              if (existingIdx >= 0) {
                index.entries[existingIdx] = entry;
              } else {
                index.entries.push(entry);
              }
            }
          }
        }

        writeIndex(index, repoRoot);
      } catch {
        // No HEAD commit yet
      }
    }
  }

  // Read current index
  const index = readIndex(repoRoot);

  if (index.entries.length === 0 && !amend) {
    console.error('nothing to commit');
    return 1;
  }

  // Get current HEAD
  const headSha = getHeadCommit(repoRoot);

  // For amend, get the previous commit's message if no new message
  let parents: string[] = [];
  if (amend) {
    if (!headSha) {
      console.error('fatal: no commit to amend');
      return 1;
    }
    const { getCommit } = require('../objects');
    const prevCommit = getCommit(headSha, repoRoot);
    parents = prevCommit.parents;
    if (!message) {
      message = prevCommit.message;
    }
  } else {
    if (headSha) {
      parents = [headSha];
    }
  }

  // Check if there are any changes to commit
  if (headSha && !amend) {
    const headTreeSha = getTreeFromTreeIsh(headSha, repoRoot);
    const headFiles = walkTree(headTreeSha, '', repoRoot);

    // Compare with index
    let hasChanges = false;
    const indexFiles = new Map<string, string>();
    for (const entry of index.entries) {
      indexFiles.set(entry.path, entry.sha);
    }

    // Check for differences
    if (indexFiles.size !== headFiles.size) {
      hasChanges = true;
    } else {
      for (const [filePath, sha] of indexFiles) {
        const headEntry = headFiles.get(filePath);
        if (!headEntry || headEntry.sha !== sha) {
          hasChanges = true;
          break;
        }
      }
    }

    if (!hasChanges) {
      console.error('nothing to commit, working tree clean');
      return 1;
    }
  }

  // Build tree from index
  const treeSha = buildTreeFromIndex(repoRoot);

  // Get author and committer info
  const authorInfo = getAuthorInfo();
  const committerInfo = getCommitterInfo();

  const author = formatAuthorDate(authorInfo.name, authorInfo.email, authorInfo.date, authorInfo.tz);
  const committer = formatAuthorDate(committerInfo.name, committerInfo.email, committerInfo.date, committerInfo.tz);

  // Create commit
  const commitSha = createCommit(treeSha, parents, author, committer, message!, repoRoot);

  // Update HEAD/branch
  const branch = getCurrentBranch(repoRoot);
  if (branch) {
    updateRef(`refs/heads/${branch}`, commitSha, repoRoot);
  } else {
    // Detached HEAD
    setHead(commitSha, repoRoot);
  }

  // Output result
  const shortSha = commitSha.slice(0, 7);
  const isRoot = parents.length === 0;
  const branchInfo = branch ? ` (${branch})` : '';
  console.log(`[${branch || 'detached HEAD'} ${isRoot ? '(root-commit) ' : ''}${shortSha}] ${message!.split('\n')[0]}`);

  return 0;
}
