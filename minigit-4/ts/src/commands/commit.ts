// commit command - Create a new commit

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, getAuthorInfo, getCommitterInfo, shortSha, normalizePathSeparator, getFileModeFromStat } from '../utils';
import { readIndex, writeIndex, createIndexEntryFromFile, addToIndex } from '../index-file';
import {
  createTreeContent,
  createCommitContent,
  writeObject,
  readObject,
  parseTreeContent,
  parseCommitContent,
  createBlobFromFile,
} from '../objects';
import { getHeadCommit, getCurrentBranch, updateBranch, writeHead, resolveRef } from '../refs';
import { TreeEntry, CommitInfo, IndexEntry } from '../types';

export function commit(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let message: string | null = null;
  let amend = false;
  let autoStage = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-m' && i + 1 < args.length) {
      message = args[++i];
    } else if (args[i] === '--amend') {
      amend = true;
    } else if (args[i] === '-a') {
      autoStage = true;
    }
  }

  if (!message && !amend) {
    console.error('fatal: must provide commit message with -m');
    return 1;
  }

  let entries = readIndex(repoRoot);

  // Auto-stage modified tracked files if -a flag
  if (autoStage) {
    entries = autoStageTrackedFiles(repoRoot, entries);
    writeIndex(repoRoot, entries);
  }

  const headCommit = getHeadCommit(repoRoot);

  // For amend, get message from previous commit if not provided
  if (amend && !message && headCommit) {
    const { content } = readObject(repoRoot, headCommit);
    const commitInfo = parseCommitContent(content);
    message = commitInfo.message;
  }

  if (!message) {
    console.error('fatal: must provide commit message with -m');
    return 1;
  }

  // Check if there are changes to commit
  if (entries.length === 0 && !amend) {
    console.error('fatal: nothing to commit');
    return 1;
  }

  // For non-amend, compare with head commit tree
  if (!amend && headCommit) {
    const { content } = readObject(repoRoot, headCommit);
    const commitInfo = parseCommitContent(content);
    const headTreeSha = commitInfo.tree;

    const newTreeSha = createTreeFromIndex(repoRoot, entries);
    if (newTreeSha === headTreeSha) {
      console.error('nothing to commit, working tree clean');
      return 1;
    }
  }

  // Create tree from index
  const treeSha = createTreeFromIndex(repoRoot, entries);

  // Build commit info
  const author = getAuthorInfo();
  const committer = getCommitterInfo();

  let parents: string[] = [];
  if (amend && headCommit) {
    // For amend, use the parent(s) of the amended commit
    const { content } = readObject(repoRoot, headCommit);
    const commitInfo = parseCommitContent(content);
    parents = commitInfo.parents;
  } else if (headCommit) {
    parents = [headCommit];
  }

  const commitInfo: CommitInfo = {
    tree: treeSha,
    parents,
    author: author.name,
    authorEmail: author.email,
    authorTimestamp: author.timestamp,
    authorTz: author.tz,
    committer: committer.name,
    committerEmail: committer.email,
    committerTimestamp: committer.timestamp,
    committerTz: committer.tz,
    message,
  };

  const commitContent = createCommitContent(commitInfo);
  const commitSha = writeObject(repoRoot, commitContent);

  // Update branch reference
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch) {
    updateBranch(repoRoot, currentBranch, commitSha);
  } else {
    // Detached HEAD
    writeHead(repoRoot, commitSha);
  }

  const branchInfo = currentBranch ? ` (${currentBranch})` : ' (HEAD detached)';
  console.log(`[${currentBranch || 'HEAD'}${parents.length === 0 ? ' (root-commit)' : ''} ${shortSha(commitSha)}] ${message.split('\n')[0]}`);

  return 0;
}

function createTreeFromIndex(repoRoot: string, entries: IndexEntry[]): string {
  // Group entries by directory
  const trees = new Map<string, TreeEntry[]>();
  trees.set('', []);

  for (const entry of entries) {
    const parts = entry.name.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');

    // Ensure all parent directories exist
    let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!trees.has(currentPath)) {
        trees.set(currentPath, []);
      }
    }

    // Add entry to its directory
    if (!trees.has(dirPath)) {
      trees.set(dirPath, []);
    }

    // Determine mode string
    let modeStr: string;
    if (entry.mode === 0o120000) {
      modeStr = '120000';
    } else if (entry.mode === 0o100755) {
      modeStr = '100755';
    } else {
      modeStr = '100644';
    }

    trees.get(dirPath)!.push({
      mode: modeStr,
      name: fileName,
      sha: entry.sha,
    });
  }

  // Build trees bottom-up
  const sortedDirs = [...trees.keys()].sort((a, b) => b.length - a.length);

  for (const dir of sortedDirs) {
    if (dir === '') continue;

    const treeEntries = trees.get(dir)!;
    const treeContent = createTreeContent(treeEntries);
    const treeSha = writeObject(repoRoot, treeContent);

    // Add this tree to parent
    const parts = dir.split('/');
    const name = parts.pop()!;
    const parentDir = parts.join('/');

    trees.get(parentDir)!.push({
      mode: '40000',
      name,
      sha: treeSha,
    });
  }

  // Create root tree
  const rootEntries = trees.get('')!;
  const rootContent = createTreeContent(rootEntries);
  return writeObject(repoRoot, rootContent);
}

function autoStageTrackedFiles(repoRoot: string, entries: IndexEntry[]): IndexEntry[] {
  const newEntries: IndexEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(fullPath)) {
      // File deleted - skip it (mark as deleted)
      continue;
    }

    const stat = fs.lstatSync(fullPath);
    const sha = createBlobFromFile(repoRoot, fullPath);
    const mode = stat.isSymbolicLink() ? 0o120000 : getFileModeFromStat(stat);
    const newEntry = createIndexEntryFromFile(entry.name, sha, mode, stat);
    newEntries.push(newEntry);
  }

  return newEntries;
}
