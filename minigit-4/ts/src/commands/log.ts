// log command - Show commit history

import { findRepoRoot, formatTimestamp, shortSha } from '../utils';
import { readObject, parseCommitContent, objectExists } from '../objects';
import { getHeadCommit, resolveRevision, getBranches, resolveRef } from '../refs';
import { CommitInfo } from '../types';

export function log(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let oneline = false;
  let showAll = false;
  let graph = false;
  let showStat = false;
  let limit: number | null = null;
  let startRef: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--oneline') {
      oneline = true;
    } else if (args[i] === '--all') {
      showAll = true;
    } else if (args[i] === '--graph') {
      graph = true;
    } else if (args[i] === '--stat') {
      showStat = true;
    } else if (args[i] === '-n' && i + 1 < args.length) {
      limit = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      startRef = args[i];
    }
  }

  // Get starting commits
  let startShas: string[] = [];

  if (showAll) {
    // Get all branch heads
    const branches = getBranches(repoRoot);
    for (const branch of branches) {
      const sha = resolveRef(repoRoot, branch);
      if (sha) startShas.push(sha);
    }
    // Also include HEAD if detached
    const headCommit = getHeadCommit(repoRoot);
    if (headCommit && !startShas.includes(headCommit)) {
      startShas.push(headCommit);
    }
  } else if (startRef) {
    const sha = resolveRevision(repoRoot, startRef);
    if (!sha) {
      console.error(`fatal: bad revision '${startRef}'`);
      return 1;
    }
    startShas = [sha];
  } else {
    const headCommit = getHeadCommit(repoRoot);
    if (!headCommit) {
      console.error('fatal: your current branch does not have any commits yet');
      return 1;
    }
    startShas = [headCommit];
  }

  // Collect commits using BFS (to handle merge commits properly)
  const commits: Array<{ sha: string; info: CommitInfo }> = [];
  const visited = new Set<string>();
  const queue = [...startShas];

  while (queue.length > 0 && (limit === null || commits.length < limit)) {
    // Sort queue by timestamp to show in order
    queue.sort((a, b) => {
      const infoA = getCommitInfo(repoRoot, a);
      const infoB = getCommitInfo(repoRoot, b);
      if (!infoA || !infoB) return 0;
      return infoB.committerTimestamp - infoA.committerTimestamp;
    });

    const sha = queue.shift()!;

    if (visited.has(sha)) continue;
    visited.add(sha);

    if (!objectExists(repoRoot, sha)) continue;

    const { type, content } = readObject(repoRoot, sha);
    if (type !== 'commit') continue;

    const info = parseCommitContent(content);
    commits.push({ sha, info });

    // Add parents to queue
    for (const parent of info.parents) {
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }

  // Print commits
  for (const { sha, info } of commits) {
    if (oneline) {
      const prefix = graph ? '* ' : '';
      console.log(`${prefix}${shortSha(sha)} ${info.message.split('\n')[0]}`);
    } else {
      if (graph) {
        console.log('*');
      }
      console.log(`commit ${sha}`);
      if (info.parents.length > 1) {
        console.log(`Merge: ${info.parents.map(shortSha).join(' ')}`);
      }
      console.log(`Author: ${info.author} <${info.authorEmail}>`);
      console.log(`Date:   ${formatTimestamp(info.authorTimestamp, info.authorTz)}`);
      console.log('');

      // Indent message
      const messageLines = info.message.split('\n');
      for (const line of messageLines) {
        console.log(`    ${line}`);
      }
      console.log('');

      if (showStat && info.parents.length > 0) {
        // Show stat would require diff calculation
        // For simplicity, just show file names changed
        printCommitStat(repoRoot, sha, info);
      }
    }
  }

  return 0;
}

function getCommitInfo(repoRoot: string, sha: string): CommitInfo | null {
  try {
    const { type, content } = readObject(repoRoot, sha);
    if (type !== 'commit') return null;
    return parseCommitContent(content);
  } catch {
    return null;
  }
}

function printCommitStat(repoRoot: string, sha: string, info: CommitInfo): void {
  if (info.parents.length === 0) return;

  const parentSha = info.parents[0];
  const parentInfo = getCommitInfo(repoRoot, parentSha);
  if (!parentInfo) return;

  // Get files in both trees
  const currentFiles = getTreeFiles(repoRoot, info.tree);
  const parentFiles = getTreeFiles(repoRoot, parentInfo.tree);

  const allFiles = new Set([...currentFiles.keys(), ...parentFiles.keys()]);
  const changedFiles: string[] = [];

  for (const file of allFiles) {
    const currentSha = currentFiles.get(file);
    const parentSha = parentFiles.get(file);

    if (currentSha !== parentSha) {
      changedFiles.push(file);
    }
  }

  for (const file of changedFiles.sort()) {
    console.log(` ${file}`);
  }
  console.log('');
}

function getTreeFiles(repoRoot: string, treeSha: string, prefix: string = ''): Map<string, string> {
  const files = new Map<string, string>();

  try {
    const { content } = readObject(repoRoot, treeSha);
    const { parseTreeContent } = require('../objects');
    const entries = parseTreeContent(content);

    for (const entry of entries) {
      const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.mode === '40000') {
        const subFiles = getTreeFiles(repoRoot, entry.sha, fullName);
        for (const [name, sha] of subFiles) {
          files.set(name, sha);
        }
      } else {
        files.set(fullName, entry.sha);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}
