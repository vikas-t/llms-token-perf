// diff command - Show changes

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePath, isBinaryContent } from '../utils';
import { readIndex } from '../index-file';
import { getHeadCommit, resolveRevision } from '../refs';
import { walkTree, getTreeFromTreeIsh, getBlob, hashObject } from '../objects';
import { generateDiff, formatDiff, formatNewFileDiff, formatDeletedFileDiff, formatDiffStat } from '../diff-algo';
import { FileDiff } from '../types';

export function diff(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let cached = false;
  let showStat = false;
  const paths: string[] = [];
  const commits: string[] = [];
  let afterDashDash = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      afterDashDash = true;
    } else if (afterDashDash) {
      paths.push(arg);
    } else if (arg === '--cached' || arg === '--staged') {
      cached = true;
    } else if (arg === '--stat') {
      showStat = true;
    } else if (!arg.startsWith('-')) {
      // Could be a commit or path
      try {
        resolveRevision(arg, repoRoot);
        commits.push(arg);
      } catch {
        paths.push(arg);
      }
    }
  }

  let diffs: FileDiff[] = [];

  if (commits.length === 2) {
    // diff <commit1> <commit2>
    diffs = diffTwoCommits(commits[0], commits[1], paths, repoRoot);
  } else if (commits.length === 1) {
    // diff <commit> - compare working tree with commit
    diffs = diffWorkingTreeWithCommit(commits[0], paths, repoRoot);
  } else if (cached) {
    // diff --cached - compare index with HEAD
    diffs = diffIndexWithHead(paths, repoRoot);
  } else {
    // diff - compare working tree with index
    diffs = diffWorkingTreeWithIndex(paths, repoRoot);
  }

  // Output
  if (showStat) {
    process.stdout.write(formatDiffStat(diffs));
  } else {
    for (const d of diffs) {
      process.stdout.write(formatDiff(d));
    }
  }

  return 0;
}

function diffWorkingTreeWithIndex(filterPaths: string[], repoRoot: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const index = readIndex(repoRoot);

  for (const entry of index.entries) {
    if (filterPaths.length > 0 && !pathMatches(entry.path, filterPaths)) {
      continue;
    }

    const fullPath = path.join(repoRoot, entry.path);

    if (!fs.existsSync(fullPath)) {
      // Deleted in working tree
      const indexContent = getBlob(entry.sha, repoRoot);
      if (isBinaryContent(indexContent)) {
        diffs.push({
          oldPath: entry.path,
          newPath: entry.path,
          hunks: [],
          isBinary: true,
        });
      } else {
        const content = indexContent.toString();
        diffs.push({
          oldPath: entry.path,
          newPath: '/dev/null',
          hunks: generateDiff(content, '', entry.path, entry.path).hunks,
        });
      }
    } else {
      const stats = fs.lstatSync(fullPath);
      if (stats.isDirectory()) continue;

      let workingContent: Buffer;
      if (stats.isSymbolicLink()) {
        workingContent = Buffer.from(fs.readlinkSync(fullPath));
      } else {
        workingContent = fs.readFileSync(fullPath);
      }

      const workingSha = hashObject('blob', workingContent);
      if (workingSha !== entry.sha) {
        const indexContent = getBlob(entry.sha, repoRoot);

        if (isBinaryContent(indexContent) || isBinaryContent(workingContent)) {
          diffs.push({
            oldPath: entry.path,
            newPath: entry.path,
            hunks: [],
            isBinary: true,
          });
        } else {
          const d = generateDiff(indexContent.toString(), workingContent.toString(), entry.path, entry.path);
          if (d.hunks.length > 0) {
            diffs.push(d);
          }
        }
      }
    }
  }

  return diffs;
}

function diffIndexWithHead(filterPaths: string[], repoRoot: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const index = readIndex(repoRoot);

  // Get HEAD tree
  const headFiles = new Map<string, { sha: string; mode: string }>();
  const headSha = getHeadCommit(repoRoot);
  if (headSha) {
    try {
      const treeSha = getTreeFromTreeIsh(headSha, repoRoot);
      walkTree(treeSha, '', repoRoot).forEach((value, key) => headFiles.set(key, value));
    } catch {
      // No tree
    }
  }

  // Index files map
  const indexFiles = new Map<string, { sha: string; mode: number }>();
  for (const entry of index.entries) {
    indexFiles.set(entry.path, { sha: entry.sha, mode: entry.mode });
  }

  // Files added or modified in index
  for (const entry of index.entries) {
    if (filterPaths.length > 0 && !pathMatches(entry.path, filterPaths)) {
      continue;
    }

    const headEntry = headFiles.get(entry.path);
    const indexContent = getBlob(entry.sha, repoRoot);

    if (!headEntry) {
      // New file
      if (isBinaryContent(indexContent)) {
        diffs.push({
          oldPath: '/dev/null',
          newPath: entry.path,
          hunks: [],
          isBinary: true,
        });
      } else {
        const d = generateDiff('', indexContent.toString(), '/dev/null', entry.path);
        diffs.push({
          oldPath: '/dev/null',
          newPath: entry.path,
          hunks: d.hunks,
        });
      }
    } else if (headEntry.sha !== entry.sha) {
      // Modified
      const headContent = getBlob(headEntry.sha, repoRoot);

      if (isBinaryContent(headContent) || isBinaryContent(indexContent)) {
        diffs.push({
          oldPath: entry.path,
          newPath: entry.path,
          hunks: [],
          isBinary: true,
        });
      } else {
        const d = generateDiff(headContent.toString(), indexContent.toString(), entry.path, entry.path);
        if (d.hunks.length > 0) {
          diffs.push(d);
        }
      }
    }
  }

  // Files deleted in index
  for (const [filePath, headEntry] of headFiles) {
    if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
      continue;
    }

    if (!indexFiles.has(filePath)) {
      const headContent = getBlob(headEntry.sha, repoRoot);
      if (isBinaryContent(headContent)) {
        diffs.push({
          oldPath: filePath,
          newPath: '/dev/null',
          hunks: [],
          isBinary: true,
        });
      } else {
        const d = generateDiff(headContent.toString(), '', filePath, '/dev/null');
        diffs.push({
          oldPath: filePath,
          newPath: '/dev/null',
          hunks: d.hunks,
        });
      }
    }
  }

  return diffs;
}

function diffTwoCommits(commit1: string, commit2: string, filterPaths: string[], repoRoot: string): FileDiff[] {
  const diffs: FileDiff[] = [];

  const sha1 = resolveRevision(commit1, repoRoot);
  const sha2 = resolveRevision(commit2, repoRoot);

  const tree1 = getTreeFromTreeIsh(sha1, repoRoot);
  const tree2 = getTreeFromTreeIsh(sha2, repoRoot);

  const files1 = walkTree(tree1, '', repoRoot);
  const files2 = walkTree(tree2, '', repoRoot);

  // All files in both trees
  const allPaths = new Set([...files1.keys(), ...files2.keys()]);

  for (const filePath of allPaths) {
    if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
      continue;
    }

    const entry1 = files1.get(filePath);
    const entry2 = files2.get(filePath);

    if (!entry1) {
      // New in commit2
      const content = getBlob(entry2!.sha, repoRoot);
      if (isBinaryContent(content)) {
        diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: [], isBinary: true });
      } else {
        const d = generateDiff('', content.toString(), '/dev/null', filePath);
        diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: d.hunks });
      }
    } else if (!entry2) {
      // Deleted in commit2
      const content = getBlob(entry1!.sha, repoRoot);
      if (isBinaryContent(content)) {
        diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: [], isBinary: true });
      } else {
        const d = generateDiff(content.toString(), '', filePath, '/dev/null');
        diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: d.hunks });
      }
    } else if (entry1.sha !== entry2.sha) {
      // Modified
      const content1 = getBlob(entry1.sha, repoRoot);
      const content2 = getBlob(entry2.sha, repoRoot);

      if (isBinaryContent(content1) || isBinaryContent(content2)) {
        diffs.push({ oldPath: filePath, newPath: filePath, hunks: [], isBinary: true });
      } else {
        const d = generateDiff(content1.toString(), content2.toString(), filePath, filePath);
        if (d.hunks.length > 0) {
          diffs.push(d);
        }
      }
    }
  }

  return diffs;
}

function diffWorkingTreeWithCommit(commit: string, filterPaths: string[], repoRoot: string): FileDiff[] {
  const diffs: FileDiff[] = [];

  const sha = resolveRevision(commit, repoRoot);
  const treeSha = getTreeFromTreeIsh(sha, repoRoot);
  const commitFiles = walkTree(treeSha, '', repoRoot);

  // Working tree files
  const workingFiles = new Map<string, { content: Buffer }>();
  collectWorkingFilesWithContent(repoRoot, repoRoot, workingFiles);

  // All paths
  const allPaths = new Set([...commitFiles.keys(), ...workingFiles.keys()]);

  for (const filePath of allPaths) {
    if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
      continue;
    }

    const commitEntry = commitFiles.get(filePath);
    const workingEntry = workingFiles.get(filePath);

    if (!commitEntry) {
      // New in working tree
      const content = workingEntry!.content;
      if (isBinaryContent(content)) {
        diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: [], isBinary: true });
      } else {
        const d = generateDiff('', content.toString(), '/dev/null', filePath);
        diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: d.hunks });
      }
    } else if (!workingEntry) {
      // Deleted in working tree
      const content = getBlob(commitEntry.sha, repoRoot);
      if (isBinaryContent(content)) {
        diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: [], isBinary: true });
      } else {
        const d = generateDiff(content.toString(), '', filePath, '/dev/null');
        diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: d.hunks });
      }
    } else {
      // Compare
      const commitContent = getBlob(commitEntry.sha, repoRoot);
      const workingContent = workingEntry.content;
      const workingSha = hashObject('blob', workingContent);

      if (workingSha !== commitEntry.sha) {
        if (isBinaryContent(commitContent) || isBinaryContent(workingContent)) {
          diffs.push({ oldPath: filePath, newPath: filePath, hunks: [], isBinary: true });
        } else {
          const d = generateDiff(commitContent.toString(), workingContent.toString(), filePath, filePath);
          if (d.hunks.length > 0) {
            diffs.push(d);
          }
        }
      }
    }
  }

  return diffs;
}

function collectWorkingFilesWithContent(dir: string, repoRoot: string, result: Map<string, { content: Buffer }>): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectWorkingFilesWithContent(fullPath, repoRoot, result);
    } else {
      const relativePath = normalizePath(path.relative(repoRoot, fullPath));
      const stats = fs.lstatSync(fullPath);
      let content: Buffer;
      if (stats.isSymbolicLink()) {
        content = Buffer.from(fs.readlinkSync(fullPath));
      } else {
        content = fs.readFileSync(fullPath);
      }
      result.set(relativePath, { content });
    }
  }
}

function pathMatches(filePath: string, filterPaths: string[]): boolean {
  for (const filter of filterPaths) {
    if (filePath === filter || filePath.startsWith(filter + '/')) {
      return true;
    }
  }
  return false;
}
