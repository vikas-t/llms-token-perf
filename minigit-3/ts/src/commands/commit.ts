// commit command - Create a new commit

import * as fs from 'fs';
import * as path from 'path';
import { TreeEntry, CommitObject } from '../types';
import { findRepoRoot, getAuthorInfo, getCommitterInfo, formatAuthor, shortSha, getFileMode, normalizePath } from '../utils';
import { writeTree, writeCommit, parseCommit, readObject } from '../objects';
import { readIndex, writeIndex } from '../index-file';
import { getHeadCommit, updateHead, getCurrentBranch } from '../refs';

export function commit(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let message = '';
  let amend = false;
  let autoStage = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-m' && i + 1 < args.length) {
      message = args[++i];
    } else if (arg === '--amend') {
      amend = true;
    } else if (arg === '-a') {
      autoStage = true;
    }
  }

  if (!message && !amend) {
    console.error('error: no commit message specified');
    process.exit(1);
  }

  // Auto-stage modified tracked files if -a
  if (autoStage) {
    autoStageModified(repoRoot);
  }

  const entries = readIndex(repoRoot);

  if (entries.length === 0) {
    console.error('nothing to commit');
    process.exit(1);
  }

  const headCommit = getHeadCommit(repoRoot);

  // Check if there are changes to commit
  if (headCommit && !amend) {
    const headObj = readObject(headCommit, repoRoot);
    const headCommitData = parseCommit(headObj.content);
    const currentTree = buildTree(entries, repoRoot);

    if (currentTree === headCommitData.tree) {
      console.error('nothing to commit, working tree clean');
      process.exit(1);
    }
  }

  // Build tree from index
  const treeSha = buildTree(entries, repoRoot);

  // Get author and committer info
  const author = getAuthorInfo();
  const committer = getCommitterInfo();

  // Build commit
  let parents: string[] = [];

  if (amend && headCommit) {
    // Get parent from previous commit
    const prevCommitObj = readObject(headCommit, repoRoot);
    const prevCommit = parseCommit(prevCommitObj.content);
    parents = prevCommit.parents;

    // Use original message if no new message provided
    if (!message) {
      message = prevCommit.message;
    }
  } else if (headCommit) {
    parents = [headCommit];
  }

  const commitObj: CommitObject = {
    tree: treeSha,
    parents,
    author: formatAuthor(author.name, author.email, author.date),
    committer: formatAuthor(committer.name, committer.email, committer.date),
    message
  };

  const commitSha = writeCommit(commitObj, repoRoot);

  // Update HEAD
  updateHead(commitSha, repoRoot);

  // Output
  const branch = getCurrentBranch(repoRoot);
  const branchDisplay = branch ? `[${branch} ${shortSha(commitSha)}]` : `[${shortSha(commitSha)}]`;
  console.log(`${branchDisplay} ${message.split('\n')[0]}`);
}

function buildTree(entries: { name: string; sha: string; mode: number }[], repoRoot: string): string {
  // Group entries by top-level directory
  const tree = new Map<string, { name: string; sha: string; mode: number }[]>();

  for (const entry of entries) {
    const parts = entry.name.split('/');
    const topLevel = parts[0];

    if (parts.length === 1) {
      // File at root level
      if (!tree.has('')) {
        tree.set('', []);
      }
      tree.get('')!.push({ name: entry.name, sha: entry.sha, mode: entry.mode });
    } else {
      // File in subdirectory
      if (!tree.has(topLevel)) {
        tree.set(topLevel, []);
      }
      tree.get(topLevel)!.push({
        name: parts.slice(1).join('/'),
        sha: entry.sha,
        mode: entry.mode
      });
    }
  }

  // Build tree entries
  const treeEntries: TreeEntry[] = [];

  // First, add root-level files
  const rootFiles = tree.get('') || [];
  for (const file of rootFiles) {
    treeEntries.push({
      mode: file.mode.toString(8).padStart(6, '0'),
      type: 'blob',
      sha: file.sha,
      name: file.name
    });
  }

  // Then, recursively build subtrees
  for (const [dir, subEntries] of tree) {
    if (dir === '') continue;

    const subtreeSha = buildTree(subEntries, repoRoot);
    treeEntries.push({
      mode: '040000',
      type: 'tree',
      sha: subtreeSha,
      name: dir
    });
  }

  return writeTree(treeEntries, repoRoot);
}

function autoStageModified(repoRoot: string): void {
  const entries = readIndex(repoRoot);
  const newEntries: typeof entries = [];

  for (const entry of entries) {
    const absPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(absPath)) {
      // File deleted - don't include in new index
      continue;
    }

    const stats = fs.statSync(absPath);

    // Check if file was modified
    if (stats.mtimeMs / 1000 !== entry.mtimeSec + entry.mtimeNsec / 1000000000) {
      // Re-read and update entry
      const { writeBlob } = require('../objects');
      const content = fs.readFileSync(absPath);
      const sha = writeBlob(content, repoRoot);
      const mode = getFileMode(absPath);

      newEntries.push({
        ...entry,
        sha,
        mode,
        mtimeSec: Math.floor(stats.mtimeMs / 1000),
        mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
        size: stats.size
      });
    } else {
      newEntries.push(entry);
    }
  }

  writeIndex(newEntries, repoRoot);
}
