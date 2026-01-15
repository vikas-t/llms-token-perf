// status command - Show working tree status

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePathSeparator, getFileModeFromStat } from '../utils';
import { readIndex } from '../index-file';
import { getHeadCommit, getCurrentBranch } from '../refs';
import { readObject, parseCommitContent, parseTreeContent, createBlobContent, hashObject } from '../objects';
import { IndexEntry } from '../types';

interface StatusResult {
  staged: { path: string; status: 'new' | 'modified' | 'deleted' }[];
  unstaged: { path: string; status: 'modified' | 'deleted' }[];
  untracked: string[];
}

export function status(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  const shortFormat = args.includes('--short') || args.includes('--porcelain');

  const result = computeStatus(repoRoot);

  if (shortFormat) {
    printShortStatus(result);
  } else {
    printLongStatus(repoRoot, result);
  }

  return 0;
}

function computeStatus(repoRoot: string): StatusResult {
  const entries = readIndex(repoRoot);
  const headCommit = getHeadCommit(repoRoot);

  // Get head tree files
  const headFiles = new Map<string, { sha: string; mode: number }>();
  if (headCommit) {
    const { content } = readObject(repoRoot, headCommit);
    const commitInfo = parseCommitContent(content);
    collectTreeFiles(repoRoot, commitInfo.tree, '', headFiles);
  }

  // Build index map
  const indexFiles = new Map<string, IndexEntry>();
  for (const entry of entries) {
    indexFiles.set(entry.name, entry);
  }

  // Compare index to HEAD (staged changes)
  const staged: StatusResult['staged'] = [];

  // Files in index but not in HEAD (new)
  for (const [name, entry] of indexFiles) {
    const headEntry = headFiles.get(name);
    if (!headEntry) {
      staged.push({ path: name, status: 'new' });
    } else if (headEntry.sha !== entry.sha) {
      staged.push({ path: name, status: 'modified' });
    }
  }

  // Files in HEAD but not in index (deleted)
  for (const [name] of headFiles) {
    if (!indexFiles.has(name)) {
      staged.push({ path: name, status: 'deleted' });
    }
  }

  // Compare working tree to index (unstaged changes)
  const unstaged: StatusResult['unstaged'] = [];
  const untracked: string[] = [];

  // Collect all working tree files
  const workingFiles = new Set<string>();
  collectWorkingTreeFiles(repoRoot, repoRoot, workingFiles);

  // Check index files against working tree
  for (const [name, entry] of indexFiles) {
    const fullPath = path.join(repoRoot, name);

    if (!fs.existsSync(fullPath)) {
      unstaged.push({ path: name, status: 'deleted' });
    } else {
      const stat = fs.lstatSync(fullPath);
      let content: Buffer;

      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(fullPath);
        content = Buffer.from(target);
      } else {
        content = fs.readFileSync(fullPath);
      }

      const blobContent = createBlobContent(content);
      const sha = hashObject(blobContent);

      if (sha !== entry.sha) {
        unstaged.push({ path: name, status: 'modified' });
      }
    }

    workingFiles.delete(name);
  }

  // Remaining files are untracked
  for (const name of workingFiles) {
    untracked.push(name);
  }

  // Sort all arrays
  staged.sort((a, b) => a.path.localeCompare(b.path));
  unstaged.sort((a, b) => a.path.localeCompare(b.path));
  untracked.sort();

  return { staged, unstaged, untracked };
}

function collectTreeFiles(
  repoRoot: string,
  treeSha: string,
  prefix: string,
  files: Map<string, { sha: string; mode: number }>
): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      // Directory - recurse
      collectTreeFiles(repoRoot, entry.sha, fullName, files);
    } else {
      files.set(fullName, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
    }
  }
}

function collectWorkingTreeFiles(repoRoot: string, dirPath: string, files: Set<string>): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));

    if (entry.isDirectory()) {
      collectWorkingTreeFiles(repoRoot, fullPath, files);
    } else {
      files.add(relativePath);
    }
  }
}

function printShortStatus(result: StatusResult): void {
  // Staged changes
  for (const change of result.staged) {
    const code = change.status === 'new' ? 'A' : change.status === 'modified' ? 'M' : 'D';
    console.log(`${code}  ${change.path}`);
  }

  // Unstaged changes
  for (const change of result.unstaged) {
    const code = change.status === 'modified' ? 'M' : 'D';
    console.log(` ${code} ${change.path}`);
  }

  // Untracked files
  for (const file of result.untracked) {
    console.log(`?? ${file}`);
  }
}

function printLongStatus(repoRoot: string, result: StatusResult): void {
  const branch = getCurrentBranch(repoRoot);

  console.log(`On branch ${branch || 'HEAD detached'}`);

  const hasStaged = result.staged.length > 0;
  const hasUnstaged = result.unstaged.length > 0;
  const hasUntracked = result.untracked.length > 0;

  if (hasStaged) {
    console.log('');
    console.log('Changes to be committed:');
    console.log('  (use "minigit restore --staged <file>..." to unstage)');
    console.log('');

    for (const change of result.staged) {
      const statusText =
        change.status === 'new' ? 'new file:   ' : change.status === 'modified' ? 'modified:   ' : 'deleted:    ';
      console.log(`\t${statusText}${change.path}`);
    }
  }

  if (hasUnstaged) {
    console.log('');
    console.log('Changes not staged for commit:');
    console.log('  (use "minigit add <file>..." to update what will be committed)');
    console.log('');

    for (const change of result.unstaged) {
      const statusText = change.status === 'modified' ? 'modified:   ' : 'deleted:    ';
      console.log(`\t${statusText}${change.path}`);
    }
  }

  if (hasUntracked) {
    console.log('');
    console.log('Untracked files:');
    console.log('  (use "minigit add <file>..." to include in what will be committed)');
    console.log('');

    for (const file of result.untracked) {
      console.log(`\t${file}`);
    }
  }

  if (!hasStaged && !hasUnstaged && !hasUntracked) {
    console.log('nothing to commit, working tree clean');
  }
}
