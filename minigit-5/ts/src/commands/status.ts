// status command - Show working tree status

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePath, sha1 } from '../utils';
import { readIndex } from '../index-file';
import { getHeadCommit, getCurrentBranch, isDetachedHead } from '../refs';
import { walkTree, getTreeFromTreeIsh, hashObject } from '../objects';

export function status(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse flags
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

  // Get current branch
  const branch = getCurrentBranch(repoRoot);

  // Get HEAD tree files
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

  // Get index files
  const index = readIndex(repoRoot);
  const indexFiles = new Map<string, { sha: string; mode: number }>();
  for (const entry of index.entries) {
    indexFiles.set(entry.path, { sha: entry.sha, mode: entry.mode });
  }

  // Get working tree files
  const workingFiles = new Set<string>();
  collectWorkingFiles(repoRoot, repoRoot, workingFiles);

  // Calculate status
  const stagedNew: string[] = [];
  const stagedModified: string[] = [];
  const stagedDeleted: string[] = [];
  const unstagedModified: string[] = [];
  const unstagedDeleted: string[] = [];
  const untracked: string[] = [];

  // Compare HEAD with index (staged changes)
  for (const [filePath, indexEntry] of indexFiles) {
    const headEntry = headFiles.get(filePath);
    if (!headEntry) {
      stagedNew.push(filePath);
    } else if (headEntry.sha !== indexEntry.sha) {
      stagedModified.push(filePath);
    }
  }

  // Files in HEAD but not in index = staged deleted
  for (const [filePath] of headFiles) {
    if (!indexFiles.has(filePath)) {
      stagedDeleted.push(filePath);
    }
  }

  // Compare index with working tree (unstaged changes)
  for (const [filePath, indexEntry] of indexFiles) {
    const fullPath = path.join(repoRoot, filePath);

    if (!fs.existsSync(fullPath)) {
      unstagedDeleted.push(filePath);
    } else {
      // Check if modified
      const stats = fs.lstatSync(fullPath);
      if (!stats.isDirectory()) {
        let content: Buffer;
        if (stats.isSymbolicLink()) {
          content = Buffer.from(fs.readlinkSync(fullPath));
        } else {
          content = fs.readFileSync(fullPath);
        }
        const workingSha = hashObject('blob', content);
        if (workingSha !== indexEntry.sha) {
          unstagedModified.push(filePath);
        }
      }
    }
  }

  // Untracked files
  for (const filePath of workingFiles) {
    if (!indexFiles.has(filePath)) {
      untracked.push(filePath);
    }
  }

  // Sort all arrays
  stagedNew.sort();
  stagedModified.sort();
  stagedDeleted.sort();
  unstagedModified.sort();
  unstagedDeleted.sort();
  untracked.sort();

  // Output
  if (shortFormat) {
    // Short format: XY filename
    for (const f of stagedNew) {
      const y = unstagedModified.includes(f) ? 'M' : unstagedDeleted.includes(f) ? 'D' : ' ';
      console.log(`A${y} ${f}`);
    }
    for (const f of stagedModified) {
      const y = unstagedModified.includes(f) ? 'M' : unstagedDeleted.includes(f) ? 'D' : ' ';
      console.log(`M${y} ${f}`);
    }
    for (const f of stagedDeleted) {
      console.log(`D  ${f}`);
    }
    for (const f of unstagedModified) {
      if (!stagedNew.includes(f) && !stagedModified.includes(f)) {
        console.log(` M ${f}`);
      }
    }
    for (const f of unstagedDeleted) {
      if (!stagedNew.includes(f) && !stagedModified.includes(f)) {
        console.log(` D ${f}`);
      }
    }
    for (const f of untracked) {
      console.log(`?? ${f}`);
    }
  } else {
    // Long format
    if (isDetachedHead(repoRoot)) {
      console.log(`HEAD detached at ${headSha?.slice(0, 7) || '(unknown)'}`);
    } else {
      console.log(`On branch ${branch || 'main'}`);
    }

    const hasStaged = stagedNew.length > 0 || stagedModified.length > 0 || stagedDeleted.length > 0;
    const hasUnstaged = unstagedModified.length > 0 || unstagedDeleted.length > 0;
    const hasUntracked = untracked.length > 0;

    if (hasStaged) {
      console.log('');
      console.log('Changes to be committed:');
      console.log('  (use "minigit restore --staged <file>..." to unstage)');
      console.log('');
      for (const f of stagedNew) {
        console.log(`\tnew file:   ${f}`);
      }
      for (const f of stagedModified) {
        console.log(`\tmodified:   ${f}`);
      }
      for (const f of stagedDeleted) {
        console.log(`\tdeleted:    ${f}`);
      }
    }

    if (hasUnstaged) {
      console.log('');
      console.log('Changes not staged for commit:');
      console.log('  (use "minigit add <file>..." to update what will be committed)');
      console.log('');
      for (const f of unstagedModified) {
        console.log(`\tmodified:   ${f}`);
      }
      for (const f of unstagedDeleted) {
        console.log(`\tdeleted:    ${f}`);
      }
    }

    if (hasUntracked) {
      console.log('');
      console.log('Untracked files:');
      console.log('  (use "minigit add <file>..." to include in what will be committed)');
      console.log('');
      for (const f of untracked) {
        console.log(`\t${f}`);
      }
    }

    if (!hasStaged && !hasUnstaged && !hasUntracked) {
      console.log('nothing to commit, working tree clean');
    }
  }

  return 0;
}

function collectWorkingFiles(dir: string, repoRoot: string, result: Set<string>): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectWorkingFiles(fullPath, repoRoot, result);
    } else {
      const relativePath = normalizePath(path.relative(repoRoot, fullPath));
      result.add(relativePath);
    }
  }
}
