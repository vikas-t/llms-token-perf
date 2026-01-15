// merge command - Merge branches

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, getAuthorInfo, getCommitterInfo, shortSha, normalizePathSeparator, ensureDir } from '../utils';
import { readIndex, writeIndex, createIndexEntryFromFile } from '../index-file';
import {
  readObject,
  parseCommitContent,
  parseTreeContent,
  createTreeContent,
  createCommitContent,
  writeObject,
  objectExists,
} from '../objects';
import { resolveRef, resolveRevision, getHeadCommit, getCurrentBranch, updateBranch, writeHead } from '../refs';
import { merge3Way, findMergeBase } from '../merge-algo';
import { CommitInfo, IndexEntry } from '../types';

export function merge(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let noCommit = false;
  let abort = false;
  let branchName: string | null = null;

  for (const arg of args) {
    if (arg === '--no-commit') {
      noCommit = true;
    } else if (arg === '--abort') {
      abort = true;
    } else if (!arg.startsWith('-')) {
      branchName = arg;
    }
  }

  if (abort) {
    return abortMerge(repoRoot);
  }

  if (!branchName) {
    console.error('fatal: branch name required');
    return 1;
  }

  // Resolve branch to commit
  const theirsSha = resolveRevision(repoRoot, branchName);
  if (!theirsSha) {
    console.error(`fatal: '${branchName}' is not a valid branch name`);
    return 1;
  }

  const oursSha = getHeadCommit(repoRoot);
  if (!oursSha) {
    console.error('fatal: HEAD does not point to a valid commit');
    return 1;
  }

  // Check if already up to date
  if (oursSha === theirsSha) {
    console.log('Already up to date.');
    return 0;
  }

  // Check if fast-forward is possible
  if (isAncestor(repoRoot, oursSha, theirsSha)) {
    // Fast-forward
    return fastForwardMerge(repoRoot, theirsSha, branchName, noCommit);
  }

  // Check if theirs is ancestor of ours (already merged)
  if (isAncestor(repoRoot, theirsSha, oursSha)) {
    console.log('Already up to date.');
    return 0;
  }

  // Find merge base
  const baseSha = findMergeBase(repoRoot, oursSha, theirsSha, (sha) => getParents(repoRoot, sha));

  if (!baseSha) {
    console.error('fatal: cannot find merge base');
    return 1;
  }

  // Perform three-way merge
  return performMerge(repoRoot, baseSha, oursSha, theirsSha, branchName, noCommit);
}

function fastForwardMerge(repoRoot: string, theirsSha: string, branchName: string, noCommit: boolean = false): number {
  const originalHead = getHeadCommit(repoRoot);

  // Update working tree and index
  updateWorkingTreeToCommit(repoRoot, theirsSha);

  if (noCommit) {
    // For --no-commit, we need to stage changes but not update the branch
    // Reset the branch back to original, but keep working tree and index
    const currentBranch = getCurrentBranch(repoRoot);
    if (currentBranch && originalHead) {
      updateBranch(repoRoot, currentBranch, originalHead);
    } else if (originalHead) {
      writeHead(repoRoot, originalHead);
    }
    console.log('Automatic merge went well; stopped before committing as requested');
    return 0;
  }

  // Update branch
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch) {
    updateBranch(repoRoot, currentBranch, theirsSha);
  } else {
    writeHead(repoRoot, theirsSha);
  }

  console.log(`Updating ${shortSha(originalHead || '')}..${shortSha(theirsSha)}`);
  console.log('Fast-forward');
  return 0;
}

function performMerge(
  repoRoot: string,
  baseSha: string,
  oursSha: string,
  theirsSha: string,
  branchName: string,
  noCommit: boolean
): number {
  // Get tree files for all three commits
  const baseFiles = getTreeFiles(repoRoot, baseSha);
  const oursFiles = getTreeFiles(repoRoot, oursSha);
  const theirsFiles = getTreeFiles(repoRoot, theirsSha);

  // Collect all file paths
  const allPaths = new Set([...baseFiles.keys(), ...oursFiles.keys(), ...theirsFiles.keys()]);

  let hasConflicts = false;
  const mergedEntries: IndexEntry[] = [];

  for (const filePath of allPaths) {
    const baseSha = baseFiles.get(filePath);
    const oursSha = oursFiles.get(filePath);
    const theirsSha = theirsFiles.get(filePath);

    if (oursSha === theirsSha) {
      // Same in both - no conflict
      if (oursSha) {
        addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
      }
      // If both deleted, don't add
      continue;
    }

    if (!theirsSha) {
      // Deleted in theirs
      if (oursSha === baseSha) {
        // Not modified in ours - accept deletion
        const fullPath = path.join(repoRoot, filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        continue;
      }
      // Modified in ours, deleted in theirs - conflict
      // Keep ours for now
      if (oursSha) {
        addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
      }
      continue;
    }

    if (!oursSha) {
      // Deleted in ours
      if (theirsSha === baseSha) {
        // Not modified in theirs - keep deletion
        continue;
      }
      // Modified in theirs, deleted in ours - add theirs
      addMergedFile(repoRoot, mergedEntries, filePath, theirsSha);
      continue;
    }

    if (!baseSha) {
      // Added in both with different content - conflict
      const oursContent = getFileContent(repoRoot, oursSha);
      const theirsContent = getFileContent(repoRoot, theirsSha);

      if (oursContent === theirsContent) {
        addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
      } else {
        // Conflict
        hasConflicts = true;
        writeConflictFile(repoRoot, filePath, null, oursContent, theirsContent, branchName);
        // Don't add to index - leave unmerged
      }
      continue;
    }

    // Both modified - need 3-way merge
    const baseContent = getFileContent(repoRoot, baseSha);
    const oursContent = getFileContent(repoRoot, oursSha);
    const theirsContent = getFileContent(repoRoot, theirsSha);

    const result = merge3Way(baseContent, oursContent, theirsContent);

    if (result.hasConflict) {
      hasConflicts = true;
      const fullPath = path.join(repoRoot, filePath);
      ensureDir(path.dirname(fullPath));

      // Write conflict markers
      const conflictContent = result.content.replace(/incoming/g, branchName);
      fs.writeFileSync(fullPath, conflictContent);
      // Don't add to index - leave unmerged
    } else {
      // Write merged content
      const fullPath = path.join(repoRoot, filePath);
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, result.content);

      // Add to index
      const stat = fs.statSync(fullPath);
      const { createBlobContent, writeObject } = require('../objects');
      const blobContent = createBlobContent(Buffer.from(result.content));
      const blobSha = writeObject(repoRoot, blobContent);

      mergedEntries.push(createIndexEntryFromFile(filePath, blobSha, 0o100644, stat));
    }
  }

  writeIndex(repoRoot, mergedEntries);

  if (hasConflicts) {
    // Save merge state
    saveMergeState(repoRoot, theirsSha, branchName);
    console.error('Automatic merge failed; fix conflicts and then commit the result.');
    return 1;
  }

  if (noCommit) {
    console.log('Automatic merge went well; stopped before committing as requested');
    return 0;
  }

  // Create merge commit
  return createMergeCommit(repoRoot, oursSha, theirsSha, branchName, mergedEntries);
}

function createMergeCommit(
  repoRoot: string,
  oursSha: string,
  theirsSha: string,
  branchName: string,
  entries: IndexEntry[]
): number {
  // Create tree from merged entries
  const treeSha = createTreeFromEntries(repoRoot, entries);

  // Create commit
  const author = getAuthorInfo();
  const committer = getCommitterInfo();

  const commitInfo: CommitInfo = {
    tree: treeSha,
    parents: [oursSha, theirsSha],
    author: author.name,
    authorEmail: author.email,
    authorTimestamp: author.timestamp,
    authorTz: author.tz,
    committer: committer.name,
    committerEmail: committer.email,
    committerTimestamp: committer.timestamp,
    committerTz: committer.tz,
    message: `Merge branch '${branchName}'`,
  };

  const commitContent = createCommitContent(commitInfo);
  const commitSha = writeObject(repoRoot, commitContent);

  // Update branch
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch) {
    updateBranch(repoRoot, currentBranch, commitSha);
  } else {
    writeHead(repoRoot, commitSha);
  }

  // Clean up merge state
  cleanMergeState(repoRoot);

  console.log(`Merge made by the 'recursive' strategy.`);
  return 0;
}

function createTreeFromEntries(repoRoot: string, entries: IndexEntry[]): string {
  // Group entries by directory
  const trees = new Map<string, Array<{ mode: string; name: string; sha: string }>>();
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

    if (!trees.has(dirPath)) {
      trees.set(dirPath, []);
    }

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

    const parts = dir.split('/');
    const name = parts.pop()!;
    const parentDir = parts.join('/');

    trees.get(parentDir)!.push({
      mode: '40000',
      name,
      sha: treeSha,
    });
  }

  const rootEntries = trees.get('')!;
  const rootContent = createTreeContent(rootEntries);
  return writeObject(repoRoot, rootContent);
}

function getTreeFiles(repoRoot: string, commitSha: string): Map<string, string> {
  const files = new Map<string, string>();

  const { type, content } = readObject(repoRoot, commitSha);
  if (type !== 'commit') return files;

  const commitInfo = parseCommitContent(content);
  collectTreeFiles(repoRoot, commitInfo.tree, '', files);

  return files;
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

function getFileContent(repoRoot: string, sha: string): string {
  const { content } = readObject(repoRoot, sha);
  return content.toString();
}

function addMergedFile(repoRoot: string, entries: IndexEntry[], filePath: string, sha: string): void {
  const { content } = readObject(repoRoot, sha);
  const fullPath = path.join(repoRoot, filePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content);

  const stat = fs.statSync(fullPath);
  entries.push(createIndexEntryFromFile(filePath, sha, 0o100644, stat));
}

function writeConflictFile(
  repoRoot: string,
  filePath: string,
  baseContent: string | null,
  oursContent: string,
  theirsContent: string,
  branchName: string
): void {
  const fullPath = path.join(repoRoot, filePath);
  ensureDir(path.dirname(fullPath));

  const lines: string[] = [];
  lines.push('<<<<<<< HEAD');
  lines.push(oursContent);
  lines.push('=======');
  lines.push(theirsContent);
  lines.push(`>>>>>>> ${branchName}`);

  fs.writeFileSync(fullPath, lines.join('\n'));
}

function isAncestor(repoRoot: string, possibleAncestor: string, descendant: string): boolean {
  const visited = new Set<string>();
  const queue = [descendant];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === possibleAncestor) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const parents = getParents(repoRoot, current);
    queue.push(...parents);
  }

  return false;
}

function getParents(repoRoot: string, sha: string): string[] {
  try {
    const { type, content } = readObject(repoRoot, sha);
    if (type !== 'commit') return [];
    const info = parseCommitContent(content);
    return info.parents;
  } catch {
    return [];
  }
}

function updateWorkingTreeToCommit(repoRoot: string, sha: string): void {
  const entries = readIndex(repoRoot);
  const currentHead = getHeadCommit(repoRoot);

  // Get current tree files
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

  // Remove files not in target
  for (const file of currentFiles) {
    if (!targetFiles.has(file)) {
      const fullPath = path.join(repoRoot, file);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
  }

  // Update/create files from target
  const newEntries: IndexEntry[] = [];

  for (const [name, { sha: fileSha, mode }] of targetFiles) {
    const fullPath = path.join(repoRoot, name);
    ensureDir(path.dirname(fullPath));

    const { content } = readObject(repoRoot, fileSha);
    fs.writeFileSync(fullPath, content);

    if (mode === '100755') {
      fs.chmodSync(fullPath, 0o755);
    }

    const stat = fs.statSync(fullPath);
    newEntries.push(createIndexEntryFromFile(name, fileSha, parseInt(mode, 8), stat));
  }

  writeIndex(repoRoot, newEntries);
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

function saveMergeState(repoRoot: string, theirsSha: string, branchName: string): void {
  const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
  fs.writeFileSync(mergeHeadPath, theirsSha + '\n');

  const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');
  fs.writeFileSync(mergeMsgPath, `Merge branch '${branchName}'\n`);
}

function cleanMergeState(repoRoot: string): void {
  const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
  const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');

  if (fs.existsSync(mergeHeadPath)) {
    fs.unlinkSync(mergeHeadPath);
  }
  if (fs.existsSync(mergeMsgPath)) {
    fs.unlinkSync(mergeMsgPath);
  }
}

function abortMerge(repoRoot: string): number {
  const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');

  if (!fs.existsSync(mergeHeadPath)) {
    console.error('fatal: There is no merge to abort');
    return 1;
  }

  // Reset to HEAD
  const headSha = getHeadCommit(repoRoot);
  if (headSha) {
    updateWorkingTreeToCommit(repoRoot, headSha);
  }

  // Clean merge state
  cleanMergeState(repoRoot);

  return 0;
}
