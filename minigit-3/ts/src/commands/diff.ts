// diff command - Show changes

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../utils';
import { readIndex } from '../index-file';
import { readObject, parseCommit, parseTree } from '../objects';
import { getHeadCommit, resolveRef } from '../refs';
import { diffFiles, formatDiff } from '../diff-algo';
import { FileDiff } from '../types';

export function diff(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let staged = false;
  let showStat = false;
  const commits: string[] = [];
  const paths: string[] = [];
  let inPathMode = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      inPathMode = true;
    } else if (inPathMode) {
      paths.push(arg);
    } else if (arg === '--staged' || arg === '--cached') {
      staged = true;
    } else if (arg === '--stat') {
      showStat = true;
    } else if (!arg.startsWith('-')) {
      // Could be a commit or a path
      const sha = resolveRef(arg, repoRoot);
      if (sha) {
        commits.push(sha);
      } else if (fs.existsSync(path.join(repoRoot, arg))) {
        paths.push(arg);
      } else {
        commits.push(arg); // Let it fail later
      }
    }
  }

  let diffs: FileDiff[];

  if (commits.length === 2) {
    // diff <commit1> <commit2>
    diffs = diffCommits(commits[0], commits[1], repoRoot, paths);
  } else if (commits.length === 1) {
    // diff <commit> - compare working tree to commit
    diffs = diffCommitToWorking(commits[0], repoRoot, paths);
  } else if (staged) {
    // diff --staged - compare index to HEAD
    diffs = diffIndexToHead(repoRoot, paths);
  } else {
    // diff - compare working tree to index
    diffs = diffWorkingToIndex(repoRoot, paths);
  }

  if (showStat) {
    printDiffStat(diffs);
  } else {
    printDiffs(diffs);
  }
}

function diffWorkingToIndex(repoRoot: string, filterPaths: string[]): FileDiff[] {
  const indexEntries = readIndex(repoRoot);
  const diffs: FileDiff[] = [];

  for (const entry of indexEntries) {
    if (filterPaths.length > 0 && !filterPaths.some(p => entry.name.startsWith(p) || entry.name === p)) {
      continue;
    }

    const workPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(workPath)) {
      // File deleted in working tree
      const obj = readObject(entry.sha, repoRoot);
      const diff = diffFiles(obj.content.toString(), '', {
        oldPath: entry.name,
        newPath: entry.name,
        oldMode: entry.mode.toString(8).padStart(6, '0')
      });
      diff.isDeleted = true;
      diffs.push(diff);
    } else {
      const stats = fs.statSync(workPath);
      if (stats.isFile()) {
        const workContent = fs.readFileSync(workPath, 'utf-8');
        const obj = readObject(entry.sha, repoRoot);
        const indexContent = obj.content.toString();

        if (workContent !== indexContent) {
          const diff = diffFiles(indexContent, workContent, {
            oldPath: entry.name,
            newPath: entry.name,
            oldMode: entry.mode.toString(8).padStart(6, '0'),
            newMode: entry.mode.toString(8).padStart(6, '0')
          });
          diffs.push(diff);
        }
      }
    }
  }

  return diffs;
}

function diffIndexToHead(repoRoot: string, filterPaths: string[]): FileDiff[] {
  const indexEntries = readIndex(repoRoot);
  const headCommit = getHeadCommit(repoRoot);
  const diffs: FileDiff[] = [];

  // Get HEAD tree files
  const headFiles = new Map<string, { sha: string; mode: string }>();
  if (headCommit) {
    const commitObj = readObject(headCommit, repoRoot);
    const commit = parseCommit(commitObj.content);
    collectTreeFilesWithMode(commit.tree, '', repoRoot, headFiles);
  }

  const indexMap = new Map(indexEntries.map(e => [e.name, e]));

  // Check files in index
  for (const entry of indexEntries) {
    if (filterPaths.length > 0 && !filterPaths.some(p => entry.name.startsWith(p) || entry.name === p)) {
      continue;
    }

    const headEntry = headFiles.get(entry.name);

    if (!headEntry) {
      // New file
      const obj = readObject(entry.sha, repoRoot);
      const diff = diffFiles('', obj.content.toString(), {
        oldPath: entry.name,
        newPath: entry.name,
        newMode: entry.mode.toString(8).padStart(6, '0')
      });
      diff.isNew = true;
      diffs.push(diff);
    } else if (headEntry.sha !== entry.sha) {
      // Modified file
      const headObj = readObject(headEntry.sha, repoRoot);
      const indexObj = readObject(entry.sha, repoRoot);
      const diff = diffFiles(headObj.content.toString(), indexObj.content.toString(), {
        oldPath: entry.name,
        newPath: entry.name,
        oldMode: headEntry.mode,
        newMode: entry.mode.toString(8).padStart(6, '0')
      });
      diffs.push(diff);
    }
  }

  // Check files deleted from index
  for (const [name, headEntry] of headFiles) {
    if (filterPaths.length > 0 && !filterPaths.some(p => name.startsWith(p) || name === p)) {
      continue;
    }

    if (!indexMap.has(name)) {
      const headObj = readObject(headEntry.sha, repoRoot);
      const diff = diffFiles(headObj.content.toString(), '', {
        oldPath: name,
        newPath: name,
        oldMode: headEntry.mode
      });
      diff.isDeleted = true;
      diffs.push(diff);
    }
  }

  return diffs;
}

function diffCommits(sha1: string, sha2: string, repoRoot: string, filterPaths: string[]): FileDiff[] {
  const commit1 = parseCommit(readObject(sha1, repoRoot).content);
  const commit2 = parseCommit(readObject(sha2, repoRoot).content);

  const files1 = new Map<string, { sha: string; mode: string }>();
  const files2 = new Map<string, { sha: string; mode: string }>();

  collectTreeFilesWithMode(commit1.tree, '', repoRoot, files1);
  collectTreeFilesWithMode(commit2.tree, '', repoRoot, files2);

  const diffs: FileDiff[] = [];
  const allPaths = new Set([...files1.keys(), ...files2.keys()]);

  for (const name of allPaths) {
    if (filterPaths.length > 0 && !filterPaths.some(p => name.startsWith(p) || name === p)) {
      continue;
    }

    const entry1 = files1.get(name);
    const entry2 = files2.get(name);

    if (!entry1) {
      // New file in commit2
      const obj = readObject(entry2!.sha, repoRoot);
      const diff = diffFiles('', obj.content.toString(), {
        oldPath: name,
        newPath: name,
        newMode: entry2!.mode
      });
      diff.isNew = true;
      diffs.push(diff);
    } else if (!entry2) {
      // Deleted in commit2
      const obj = readObject(entry1.sha, repoRoot);
      const diff = diffFiles(obj.content.toString(), '', {
        oldPath: name,
        newPath: name,
        oldMode: entry1.mode
      });
      diff.isDeleted = true;
      diffs.push(diff);
    } else if (entry1.sha !== entry2.sha) {
      // Modified
      const obj1 = readObject(entry1.sha, repoRoot);
      const obj2 = readObject(entry2.sha, repoRoot);
      const diff = diffFiles(obj1.content.toString(), obj2.content.toString(), {
        oldPath: name,
        newPath: name,
        oldMode: entry1.mode,
        newMode: entry2.mode
      });
      diffs.push(diff);
    }
  }

  return diffs;
}

function diffCommitToWorking(sha: string, repoRoot: string, filterPaths: string[]): FileDiff[] {
  const commit = parseCommit(readObject(sha, repoRoot).content);
  const commitFiles = new Map<string, { sha: string; mode: string }>();
  collectTreeFilesWithMode(commit.tree, '', repoRoot, commitFiles);

  const workingFiles = new Set<string>();
  collectWorkingFiles(repoRoot, '', repoRoot, workingFiles);

  const diffs: FileDiff[] = [];
  const allPaths = new Set([...commitFiles.keys(), ...workingFiles]);

  for (const name of allPaths) {
    if (filterPaths.length > 0 && !filterPaths.some(p => name.startsWith(p) || name === p)) {
      continue;
    }

    const commitEntry = commitFiles.get(name);
    const workPath = path.join(repoRoot, name);
    const existsInWorking = fs.existsSync(workPath);

    if (!commitEntry && existsInWorking) {
      // New file
      const content = fs.readFileSync(workPath, 'utf-8');
      const diff = diffFiles('', content, { oldPath: name, newPath: name });
      diff.isNew = true;
      diffs.push(diff);
    } else if (commitEntry && !existsInWorking) {
      // Deleted
      const obj = readObject(commitEntry.sha, repoRoot);
      const diff = diffFiles(obj.content.toString(), '', {
        oldPath: name,
        newPath: name,
        oldMode: commitEntry.mode
      });
      diff.isDeleted = true;
      diffs.push(diff);
    } else if (commitEntry && existsInWorking) {
      const workContent = fs.readFileSync(workPath, 'utf-8');
      const commitObj = readObject(commitEntry.sha, repoRoot);
      const commitContent = commitObj.content.toString();

      if (workContent !== commitContent) {
        const diff = diffFiles(commitContent, workContent, {
          oldPath: name,
          newPath: name,
          oldMode: commitEntry.mode
        });
        diffs.push(diff);
      }
    }
  }

  return diffs;
}

function collectTreeFilesWithMode(treeSha: string, prefix: string, repoRoot: string, files: Map<string, { sha: string; mode: string }>): void {
  const treeObj = readObject(treeSha, repoRoot);
  const entries = parseTree(treeObj.content);

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'tree') {
      collectTreeFilesWithMode(entry.sha, name, repoRoot, files);
    } else {
      files.set(name, { sha: entry.sha, mode: entry.mode });
    }
  }
}

function collectWorkingFiles(dir: string, prefix: string, repoRoot: string, files: Set<string>): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.minigit') continue;

    const name = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      collectWorkingFiles(path.join(dir, entry.name), name, repoRoot, files);
    } else if (entry.isFile()) {
      files.add(name);
    }
  }
}

function printDiffs(diffs: FileDiff[]): void {
  for (const diff of diffs) {
    console.log(formatDiff(diff));
  }
}

function printDiffStat(diffs: FileDiff[]): void {
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const diff of diffs) {
    let insertions = 0;
    let deletions = 0;

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          insertions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
    }

    const changes = insertions + deletions;
    const bar = '+'.repeat(Math.min(insertions, 30)) + '-'.repeat(Math.min(deletions, 30));
    console.log(` ${diff.newPath.padEnd(40)} | ${String(changes).padStart(4)} ${bar}`);

    totalInsertions += insertions;
    totalDeletions += deletions;
  }

  if (diffs.length > 0) {
    console.log(` ${diffs.length} file${diffs.length > 1 ? 's' : ''} changed, ${totalInsertions} insertion${totalInsertions !== 1 ? 's' : ''}(+), ${totalDeletions} deletion${totalDeletions !== 1 ? 's' : ''}(-)`);
  }
}
