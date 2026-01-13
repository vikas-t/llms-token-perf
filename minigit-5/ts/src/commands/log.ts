// log command - Show commit history

import { findRepoRoot, formatDate, parseTimestamp } from '../utils';
import { getCommit, readObject, getBlob, getTreeFromTreeIsh, walkTree } from '../objects';
import { getHeadCommit, resolveRevision, listBranches } from '../refs';
import { generateDiff, formatDiff, formatDiffStat } from '../diff-algo';
import { FileDiff } from '../types';

export function log(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let oneline = false;
  let showAll = false;
  let graph = false;
  let showStat = false;
  let limit = -1;
  let startRevision: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--oneline') {
      oneline = true;
    } else if (arg === '--all') {
      showAll = true;
    } else if (arg === '--graph') {
      graph = true;
    } else if (arg === '--stat') {
      showStat = true;
    } else if (arg === '-n' && i + 1 < args.length) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (!arg.startsWith('-')) {
      startRevision = arg;
    }
  }

  // Collect starting commits
  const startShas: string[] = [];

  if (showAll) {
    // Get all branch heads
    const branches = listBranches(repoRoot);
    for (const branch of branches) {
      try {
        const sha = resolveRevision(branch, repoRoot);
        if (!startShas.includes(sha)) {
          startShas.push(sha);
        }
      } catch {
        // Skip invalid branches
      }
    }
    // Also include HEAD
    const headSha = getHeadCommit(repoRoot);
    if (headSha && !startShas.includes(headSha)) {
      startShas.push(headSha);
    }
  } else if (startRevision) {
    try {
      const sha = resolveRevision(startRevision, repoRoot);
      startShas.push(sha);
    } catch (e: any) {
      console.error(`fatal: ${e.message}`);
      return 1;
    }
  } else {
    const headSha = getHeadCommit(repoRoot);
    if (!headSha) {
      console.error('fatal: your current branch does not have any commits yet');
      return 1;
    }
    startShas.push(headSha);
  }

  // Walk commits in reverse chronological order
  const visited = new Set<string>();
  const queue: string[] = [...startShas];
  const commits: Array<{ sha: string; date: Date }> = [];

  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (visited.has(sha)) continue;
    visited.add(sha);

    try {
      const commit = getCommit(sha, repoRoot);

      // Parse date from author line
      const authorParts = commit.author.split(' ');
      const timestamp = parseInt(authorParts[authorParts.length - 2], 10);
      const date = new Date(timestamp * 1000);

      commits.push({ sha, date });

      // Add parents to queue
      for (const parent of commit.parents) {
        if (!visited.has(parent)) {
          queue.push(parent);
        }
      }
    } catch {
      // Skip invalid commits
    }
  }

  // Sort by date (newest first)
  commits.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Apply limit
  const toShow = limit > 0 ? commits.slice(0, limit) : commits;

  // Output
  for (let i = 0; i < toShow.length; i++) {
    const { sha } = toShow[i];
    const commit = getCommit(sha, repoRoot);

    if (oneline) {
      const prefix = graph ? '* ' : '';
      const shortSha = sha.slice(0, 7);
      const firstLine = commit.message.split('\n')[0];
      console.log(`${prefix}${shortSha} ${firstLine}`);
    } else {
      if (graph && i > 0) {
        console.log('|');
      }
      const prefix = graph ? '* ' : '';
      console.log(`${prefix}commit ${sha}`);

      // Parse author
      const authorMatch = commit.author.match(/^(.+) <(.+)> (\d+) ([+-]\d{4})$/);
      if (authorMatch) {
        console.log(`Author: ${authorMatch[1]} <${authorMatch[2]}>`);
        const date = new Date(parseInt(authorMatch[3], 10) * 1000);
        console.log(`Date:   ${formatDate(date)}`);
      } else {
        console.log(`Author: ${commit.author}`);
      }

      console.log('');
      const messageLines = commit.message.split('\n');
      for (const line of messageLines) {
        console.log(`    ${line}`);
      }

      if (showStat) {
        // Show stat
        const diffs = getCommitDiffs(sha, commit, repoRoot);
        if (diffs.length > 0) {
          console.log('');
          process.stdout.write(formatDiffStat(diffs));
        }
      }

      if (i < toShow.length - 1) {
        console.log('');
      }
    }
  }

  return 0;
}

function getCommitDiffs(sha: string, commit: ReturnType<typeof getCommit>, repoRoot: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const currentTree = commit.tree;
  const currentFiles = walkTree(currentTree, '', repoRoot);

  if (commit.parents.length > 0) {
    const parentSha = commit.parents[0];
    const parentTree = getTreeFromTreeIsh(parentSha, repoRoot);
    const parentFiles = walkTree(parentTree, '', repoRoot);

    const allPaths = new Set([...parentFiles.keys(), ...currentFiles.keys()]);

    for (const filePath of allPaths) {
      const parentEntry = parentFiles.get(filePath);
      const currentEntry = currentFiles.get(filePath);

      if (!parentEntry && currentEntry) {
        const newContent = getBlob(currentEntry.sha, repoRoot).toString();
        const diff = generateDiff('', newContent, '/dev/null', filePath);
        diffs.push({ ...diff, oldPath: '/dev/null', newPath: filePath });
      } else if (parentEntry && !currentEntry) {
        const oldContent = getBlob(parentEntry.sha, repoRoot).toString();
        const diff = generateDiff(oldContent, '', filePath, '/dev/null');
        diffs.push({ ...diff, oldPath: filePath, newPath: '/dev/null' });
      } else if (parentEntry && currentEntry && parentEntry.sha !== currentEntry.sha) {
        const oldContent = getBlob(parentEntry.sha, repoRoot).toString();
        const newContent = getBlob(currentEntry.sha, repoRoot).toString();
        const diff = generateDiff(oldContent, newContent, filePath, filePath);
        if (diff.hunks.length > 0) {
          diffs.push(diff);
        }
      }
    }
  } else {
    // Initial commit
    for (const [filePath, entry] of currentFiles) {
      const content = getBlob(entry.sha, repoRoot).toString();
      const diff = generateDiff('', content, '/dev/null', filePath);
      diffs.push({ ...diff, oldPath: '/dev/null', newPath: filePath });
    }
  }

  return diffs;
}
