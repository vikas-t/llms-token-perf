// merge command - Merge branches

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, ensureDir, getAuthorInfo, getCommitterInfo, formatAuthor, shortSha } from '../utils';
import { readIndex, writeIndex } from '../index-file';
import {
  resolveRef,
  getHeadCommit,
  getCurrentBranch,
  updateHead
} from '../refs';
import { readObject, parseCommit, parseTree, writeCommit, writeTree, writeBlob } from '../objects';
import { mergeFiles } from '../merge-algo';
import { CommitObject, TreeEntry, IndexEntry } from '../types';

export function merge(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let noCommit = false;
  let abort = false;
  let branchName: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-commit') {
      noCommit = true;
    } else if (arg === '--abort') {
      abort = true;
    } else if (!arg.startsWith('-')) {
      branchName = arg;
    }
  }

  if (abort) {
    // Abort merge
    abortMerge(repoRoot);
    return;
  }

  if (!branchName) {
    console.error('fatal: specify a branch to merge');
    process.exit(1);
  }

  const headSha = getHeadCommit(repoRoot);
  if (!headSha) {
    console.error('fatal: HEAD does not point to a valid commit');
    process.exit(1);
  }

  const mergeSha = resolveRef(branchName, repoRoot);
  if (!mergeSha) {
    console.error(`merge: ${branchName} - not something we can merge`);
    process.exit(1);
  }

  // Check if already up to date
  if (headSha === mergeSha) {
    console.log('Already up to date.');
    return;
  }

  // Check if merge commit is ancestor of HEAD
  if (isAncestor(mergeSha, headSha, repoRoot)) {
    console.log('Already up to date.');
    return;
  }

  // Check for fast-forward
  if (isAncestor(headSha, mergeSha, repoRoot)) {
    fastForwardMerge(mergeSha, branchName, noCommit, repoRoot);
    return;
  }

  // Find merge base
  const mergeBase = findMergeBase(headSha, mergeSha, repoRoot);
  if (!mergeBase) {
    console.error('fatal: refusing to merge unrelated histories');
    process.exit(1);
  }

  // Perform three-way merge
  const result = threeWayMerge(mergeBase, headSha, mergeSha, branchName, repoRoot);

  if (result.conflicts.length > 0) {
    console.error('CONFLICT (content): Merge conflict in the following files:');
    for (const file of result.conflicts) {
      console.error(`  ${file}`);
    }
    console.error('Automatic merge failed; fix conflicts and then commit the result.');
    process.exit(1);
  }

  if (noCommit) {
    console.log(`Automatic merge went well; stopped before committing as requested`);
    return;
  }

  // Create merge commit
  const author = getAuthorInfo();
  const committer = getCommitterInfo();

  const commitObj: CommitObject = {
    tree: result.treeSha,
    parents: [headSha, mergeSha],
    author: formatAuthor(author.name, author.email, author.date),
    committer: formatAuthor(committer.name, committer.email, committer.date),
    message: `Merge branch '${branchName}'`
  };

  const commitSha = writeCommit(commitObj, repoRoot);
  updateHead(commitSha, repoRoot);

  console.log(`Merge made by the 'ort' strategy.`);
}

function fastForwardMerge(targetSha: string, branchName: string, noCommit: boolean, repoRoot: string): void {
  const headSha = getHeadCommit(repoRoot);
  const headCommit = headSha ? parseCommit(readObject(headSha, repoRoot).content) : null;
  const headFiles = new Map<string, { sha: string; mode: number }>();
  if (headCommit) {
    collectTreeFilesWithMode(headCommit.tree, '', repoRoot, headFiles);
  }

  const targetCommit = parseCommit(readObject(targetSha, repoRoot).content);
  const targetFiles = new Map<string, { sha: string; mode: number }>();
  collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);

  // Update files in working tree
  for (const [name, entry] of targetFiles) {
    const absPath = path.join(repoRoot, name);
    ensureDir(path.dirname(absPath));
    const obj = readObject(entry.sha, repoRoot);
    fs.writeFileSync(absPath, obj.content);
    if (entry.mode === 0o100755) {
      fs.chmodSync(absPath, 0o755);
    }
  }

  // Update index
  const newEntries: IndexEntry[] = [];
  for (const [name, entry] of targetFiles) {
    const absPath = path.join(repoRoot, name);
    const stats = fs.statSync(absPath);

    newEntries.push({
      ctimeSec: Math.floor(stats.ctimeMs / 1000),
      ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
      mtimeSec: Math.floor(stats.mtimeMs / 1000),
      mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
      dev: stats.dev,
      ino: stats.ino,
      mode: entry.mode,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      sha: entry.sha,
      flags: Math.min(name.length, 0xfff),
      name
    });
  }
  writeIndex(newEntries, repoRoot);

  if (noCommit) {
    console.log(`Automatic merge went well; stopped before committing as requested`);
  } else {
    updateHead(targetSha, repoRoot);
    console.log(`Fast-forward`);
  }
}

function threeWayMerge(
  baseSha: string,
  oursSha: string,
  theirsSha: string,
  branchName: string,
  repoRoot: string
): { treeSha: string; conflicts: string[] } {
  const baseFiles = new Map<string, { sha: string; mode: number }>();
  const oursFiles = new Map<string, { sha: string; mode: number }>();
  const theirsFiles = new Map<string, { sha: string; mode: number }>();

  const baseCommit = parseCommit(readObject(baseSha, repoRoot).content);
  const oursCommit = parseCommit(readObject(oursSha, repoRoot).content);
  const theirsCommit = parseCommit(readObject(theirsSha, repoRoot).content);

  collectTreeFilesWithMode(baseCommit.tree, '', repoRoot, baseFiles);
  collectTreeFilesWithMode(oursCommit.tree, '', repoRoot, oursFiles);
  collectTreeFilesWithMode(theirsCommit.tree, '', repoRoot, theirsFiles);

  const allPaths = new Set([...baseFiles.keys(), ...oursFiles.keys(), ...theirsFiles.keys()]);
  const conflicts: string[] = [];
  const mergedEntries: { name: string; sha: string; mode: number }[] = [];

  for (const name of allPaths) {
    const baseEntry = baseFiles.get(name);
    const oursEntry = oursFiles.get(name);
    const theirsEntry = theirsFiles.get(name);

    const baseContent = baseEntry ? readObject(baseEntry.sha, repoRoot).content.toString() : null;
    const oursContent = oursEntry ? readObject(oursEntry.sha, repoRoot).content.toString() : null;
    const theirsContent = theirsEntry ? readObject(theirsEntry.sha, repoRoot).content.toString() : null;

    // Simple cases
    if (oursContent === theirsContent) {
      if (oursContent !== null) {
        mergedEntries.push({ name, sha: oursEntry!.sha, mode: oursEntry!.mode });
      }
      continue;
    }

    if (baseContent === oursContent && theirsContent !== null) {
      // Only theirs changed
      mergedEntries.push({ name, sha: theirsEntry!.sha, mode: theirsEntry!.mode });
      updateFile(name, theirsEntry!.sha, theirsEntry!.mode, repoRoot);
      continue;
    }

    if (baseContent === theirsContent && oursContent !== null) {
      // Only ours changed
      mergedEntries.push({ name, sha: oursEntry!.sha, mode: oursEntry!.mode });
      continue;
    }

    // Both changed - try three-way merge
    const mergeResult = mergeFiles(baseContent, oursContent, theirsContent, branchName);

    if (!mergeResult.success) {
      conflicts.push(name);
    }

    // Write merged content
    const mergedBuffer = Buffer.from(mergeResult.mergedContent || '');
    const mergedSha = writeBlob(mergedBuffer, repoRoot);
    const mode = oursEntry?.mode || theirsEntry?.mode || 0o100644;
    mergedEntries.push({ name, sha: mergedSha, mode });

    // Update working tree
    const absPath = path.join(repoRoot, name);
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, mergeResult.mergedContent || '');
  }

  // Build tree from merged entries
  const treeSha = buildTree(mergedEntries, repoRoot);

  // Update index
  const newIndexEntries: IndexEntry[] = [];
  for (const entry of mergedEntries) {
    const absPath = path.join(repoRoot, entry.name);
    if (!fs.existsSync(absPath)) continue;

    const stats = fs.statSync(absPath);
    newIndexEntries.push({
      ctimeSec: Math.floor(stats.ctimeMs / 1000),
      ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
      mtimeSec: Math.floor(stats.mtimeMs / 1000),
      mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
      dev: stats.dev,
      ino: stats.ino,
      mode: entry.mode,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      sha: entry.sha,
      flags: Math.min(entry.name.length, 0xfff),
      name: entry.name
    });
  }
  writeIndex(newIndexEntries, repoRoot);

  return { treeSha, conflicts };
}

function updateFile(name: string, sha: string, mode: number, repoRoot: string): void {
  const absPath = path.join(repoRoot, name);
  ensureDir(path.dirname(absPath));
  const obj = readObject(sha, repoRoot);
  fs.writeFileSync(absPath, obj.content);
  if (mode === 0o100755) {
    fs.chmodSync(absPath, 0o755);
  }
}

function buildTree(entries: { name: string; sha: string; mode: number }[], repoRoot: string): string {
  const tree = new Map<string, { name: string; sha: string; mode: number }[]>();

  for (const entry of entries) {
    const parts = entry.name.split('/');
    const topLevel = parts[0];

    if (parts.length === 1) {
      if (!tree.has('')) tree.set('', []);
      tree.get('')!.push({ name: entry.name, sha: entry.sha, mode: entry.mode });
    } else {
      if (!tree.has(topLevel)) tree.set(topLevel, []);
      tree.get(topLevel)!.push({
        name: parts.slice(1).join('/'),
        sha: entry.sha,
        mode: entry.mode
      });
    }
  }

  const treeEntries: TreeEntry[] = [];

  const rootFiles = tree.get('') || [];
  for (const file of rootFiles) {
    treeEntries.push({
      mode: file.mode.toString(8).padStart(6, '0'),
      type: 'blob',
      sha: file.sha,
      name: file.name
    });
  }

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

function isAncestor(commitSha: string, headSha: string, repoRoot: string): boolean {
  const visited = new Set<string>();
  const queue = [headSha];

  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (sha === commitSha) return true;
    if (visited.has(sha)) continue;
    visited.add(sha);

    try {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'commit') {
        const commit = parseCommit(obj.content);
        queue.push(...commit.parents);
      }
    } catch {
      // Ignore errors
    }
  }

  return false;
}

function findMergeBase(sha1: string, sha2: string, repoRoot: string): string | null {
  // Get all ancestors of sha1
  const ancestors1 = new Set<string>();
  const queue1 = [sha1];

  while (queue1.length > 0) {
    const sha = queue1.shift()!;
    if (ancestors1.has(sha)) continue;
    ancestors1.add(sha);

    try {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'commit') {
        const commit = parseCommit(obj.content);
        queue1.push(...commit.parents);
      }
    } catch {
      // Ignore errors
    }
  }

  // Find first common ancestor from sha2
  const queue2 = [sha2];
  const visited = new Set<string>();

  while (queue2.length > 0) {
    const sha = queue2.shift()!;
    if (visited.has(sha)) continue;
    visited.add(sha);

    if (ancestors1.has(sha)) {
      return sha;
    }

    try {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'commit') {
        const commit = parseCommit(obj.content);
        queue2.push(...commit.parents);
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}

function abortMerge(repoRoot: string): void {
  const headSha = getHeadCommit(repoRoot);
  if (!headSha) {
    console.error('fatal: no merge in progress');
    process.exit(1);
  }

  // Reset to HEAD
  const commit = parseCommit(readObject(headSha, repoRoot).content);
  const files = new Map<string, { sha: string; mode: number }>();
  collectTreeFilesWithMode(commit.tree, '', repoRoot, files);

  for (const [name, entry] of files) {
    const absPath = path.join(repoRoot, name);
    ensureDir(path.dirname(absPath));
    const obj = readObject(entry.sha, repoRoot);
    fs.writeFileSync(absPath, obj.content);
  }

  console.log('Merge aborted.');
}

function collectTreeFilesWithMode(treeSha: string, prefix: string, repoRoot: string, files: Map<string, { sha: string; mode: number }>): void {
  const treeObj = readObject(treeSha, repoRoot);
  const entries = parseTree(treeObj.content);

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'tree') {
      collectTreeFilesWithMode(entry.sha, name, repoRoot, files);
    } else {
      files.set(name, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
    }
  }
}
