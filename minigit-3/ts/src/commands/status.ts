// status command - Show working tree status

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePath } from '../utils';
import { readIndex } from '../index-file';
import { getHeadCommit, getCurrentBranch, isHeadDetached } from '../refs';
import { readObject, parseCommit, parseTree } from '../objects';

interface StatusEntry {
  path: string;
  indexStatus: string;
  workStatus: string;
}

export function status(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let shortFormat = false;
  let porcelain = false;

  for (const arg of args) {
    if (arg === '--short' || arg === '-s') {
      shortFormat = true;
    } else if (arg === '--porcelain') {
      porcelain = true;
      shortFormat = true;
    }
  }

  const entries = getStatusEntries(repoRoot);

  if (shortFormat || porcelain) {
    printShortStatus(entries);
  } else {
    printLongStatus(entries, repoRoot);
  }
}

function getStatusEntries(repoRoot: string): StatusEntry[] {
  const indexEntries = readIndex(repoRoot);
  const indexMap = new Map(indexEntries.map(e => [e.name, e]));
  const headCommit = getHeadCommit(repoRoot);

  // Get HEAD tree files
  const headFiles = new Map<string, { sha: string; mode: number }>();
  if (headCommit) {
    const commitObj = readObject(headCommit, repoRoot);
    const commit = parseCommit(commitObj.content);
    collectTreeFiles(commit.tree, '', repoRoot, headFiles);
  }

  // Collect working directory files
  const workingFiles = new Set<string>();
  collectWorkingFiles(repoRoot, '', repoRoot, workingFiles);

  const result: StatusEntry[] = [];
  const seen = new Set<string>();

  // Check index entries
  for (const [name, entry] of indexMap) {
    seen.add(name);

    const headEntry = headFiles.get(name);
    const workPath = path.join(repoRoot, name);
    const exists = fs.existsSync(workPath);

    let indexStatus = ' ';
    let workStatus = ' ';

    // Index vs HEAD status
    if (!headEntry) {
      indexStatus = 'A'; // Added to index
    } else if (headEntry.sha !== entry.sha) {
      indexStatus = 'M'; // Modified in index
    }

    // Working tree vs index status
    if (!exists) {
      workStatus = 'D'; // Deleted from working tree
    } else {
      const stats = fs.statSync(workPath);
      if (stats.isFile()) {
        const content = fs.readFileSync(workPath);
        const { sha1 } = require('../utils');
        const header = `blob ${content.length}\0`;
        const fullContent = Buffer.concat([Buffer.from(header), content]);
        const workSha = sha1(fullContent);
        if (workSha !== entry.sha) {
          workStatus = 'M'; // Modified in working tree
        }
      }
    }

    if (indexStatus !== ' ' || workStatus !== ' ') {
      result.push({ path: name, indexStatus, workStatus });
    }
  }

  // Check HEAD files not in index (staged deletions)
  for (const [name, entry] of headFiles) {
    if (!seen.has(name) && !indexMap.has(name)) {
      seen.add(name);
      result.push({ path: name, indexStatus: 'D', workStatus: ' ' });
    }
  }

  // Check untracked files
  for (const name of workingFiles) {
    if (!seen.has(name) && !indexMap.has(name)) {
      result.push({ path: name, indexStatus: '?', workStatus: '?' });
    }
  }

  // Sort by path
  result.sort((a, b) => a.path.localeCompare(b.path));

  return result;
}

function collectTreeFiles(treeSha: string, prefix: string, repoRoot: string, files: Map<string, { sha: string; mode: number }>): void {
  const treeObj = readObject(treeSha, repoRoot);
  const entries = parseTree(treeObj.content);

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'tree') {
      collectTreeFiles(entry.sha, name, repoRoot, files);
    } else {
      files.set(name, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
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
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.add(name);
    }
  }
}

function printShortStatus(entries: StatusEntry[]): void {
  for (const entry of entries) {
    console.log(`${entry.indexStatus}${entry.workStatus} ${entry.path}`);
  }
}

function printLongStatus(entries: StatusEntry[], repoRoot: string): void {
  const branch = getCurrentBranch(repoRoot);

  if (branch) {
    console.log(`On branch ${branch}`);
  } else if (isHeadDetached(repoRoot)) {
    console.log('HEAD detached');
  }

  const staged: StatusEntry[] = [];
  const unstaged: StatusEntry[] = [];
  const untracked: StatusEntry[] = [];

  for (const entry of entries) {
    if (entry.indexStatus === '?') {
      untracked.push(entry);
    } else if (entry.indexStatus !== ' ') {
      staged.push(entry);
    }
    if (entry.workStatus !== ' ' && entry.workStatus !== '?') {
      unstaged.push(entry);
    }
  }

  if (staged.length > 0) {
    console.log('\nChanges to be committed:');
    console.log('  (use "git restore --staged <file>..." to unstage)');
    for (const entry of staged) {
      const status = getStatusLabel(entry.indexStatus);
      console.log(`\t${status}:   ${entry.path}`);
    }
  }

  if (unstaged.length > 0) {
    console.log('\nChanges not staged for commit:');
    console.log('  (use "git add <file>..." to update what will be committed)');
    for (const entry of unstaged) {
      const status = getStatusLabel(entry.workStatus);
      console.log(`\t${status}:   ${entry.path}`);
    }
  }

  if (untracked.length > 0) {
    console.log('\nUntracked files:');
    console.log('  (use "git add <file>..." to include in what will be committed)');
    for (const entry of untracked) {
      console.log(`\t${entry.path}`);
    }
  }

  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
    console.log('\nnothing to commit, working tree clean');
  } else if (staged.length === 0) {
    console.log('\nno changes added to commit');
  }
}

function getStatusLabel(code: string): string {
  switch (code) {
    case 'A': return 'new file';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'unknown';
  }
}
