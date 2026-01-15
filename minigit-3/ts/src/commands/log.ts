// log command - Show commit history

import { findRepoRoot, formatDate, parseTimestamp, shortSha } from '../utils';
import { readObject, parseCommit } from '../objects';
import { resolveRef, getHeadCommit, listBranches } from '../refs';

export function log(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let oneline = false;
  let all = false;
  let limit = Infinity;
  let showGraph = false;
  let showStat = false;
  let revision: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--oneline') {
      oneline = true;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--graph') {
      showGraph = true;
    } else if (arg === '--stat') {
      showStat = true;
    } else if (arg === '-n' && i + 1 < args.length) {
      limit = parseInt(args[++i], 10);
    } else if (arg.startsWith('-n')) {
      limit = parseInt(arg.slice(2), 10);
    } else if (!arg.startsWith('-')) {
      revision = arg;
    }
  }

  // Get starting commits
  let startCommits: string[] = [];

  if (all) {
    const branches = listBranches(repoRoot);
    for (const branch of branches) {
      const sha = resolveRef(branch, repoRoot);
      if (sha) startCommits.push(sha);
    }
  } else if (revision) {
    const sha = resolveRef(revision, repoRoot);
    if (!sha) {
      console.error(`fatal: bad revision '${revision}'`);
      process.exit(1);
    }
    startCommits = [sha];
  } else {
    const head = getHeadCommit(repoRoot);
    if (!head) {
      console.error('fatal: your current branch does not have any commits yet');
      process.exit(1);
    }
    startCommits = [head];
  }

  // Walk commits
  const seen = new Set<string>();
  const queue = [...startCommits];
  let count = 0;

  while (queue.length > 0 && count < limit) {
    // Sort by timestamp (most recent first)
    queue.sort((a, b) => {
      try {
        const objA = readObject(a, repoRoot);
        const objB = readObject(b, repoRoot);
        const commitA = parseCommit(objA.content);
        const commitB = parseCommit(objB.content);
        const tsA = parseTimestamp(commitA.committer.split(' ').slice(-2).join(' ')).timestamp;
        const tsB = parseTimestamp(commitB.committer.split(' ').slice(-2).join(' ')).timestamp;
        return tsB - tsA;
      } catch {
        return 0;
      }
    });

    const sha = queue.shift()!;
    if (seen.has(sha)) continue;
    seen.add(sha);

    const obj = readObject(sha, repoRoot);
    if (obj.type !== 'commit') continue;

    const commit = parseCommit(obj.content);

    if (oneline) {
      printOnelineCommit(sha, commit, showGraph);
    } else {
      printFullCommit(sha, commit, showStat, repoRoot);
    }

    count++;

    // Add parents to queue
    for (const parent of commit.parents) {
      if (!seen.has(parent)) {
        queue.push(parent);
      }
    }
  }
}

function printOnelineCommit(sha: string, commit: ReturnType<typeof parseCommit>, showGraph: boolean): void {
  const short = shortSha(sha);
  const message = commit.message.split('\n')[0];
  if (showGraph) {
    console.log(`* ${short} ${message}`);
  } else {
    console.log(`${short} ${message}`);
  }
}

function printFullCommit(sha: string, commit: ReturnType<typeof parseCommit>, showStat: boolean, repoRoot: string): void {
  console.log(`commit ${sha}`);

  if (commit.parents.length > 1) {
    console.log(`Merge: ${commit.parents.map(p => shortSha(p)).join(' ')}`);
  }

  // Parse author info
  const authorMatch = commit.author.match(/^(.+?) <(.+?)> (\d+) ([+-]\d{4})$/);
  if (authorMatch) {
    const [, name, email, timestamp, tz] = authorMatch;
    const dateStr = formatDate(parseInt(timestamp, 10), tz);
    console.log(`Author: ${name} <${email}>`);
    console.log(`Date:   ${dateStr}`);
  } else {
    console.log(`Author: ${commit.author}`);
  }

  console.log('');
  for (const line of commit.message.split('\n')) {
    console.log(`    ${line}`);
  }

  if (showStat && commit.parents.length > 0) {
    printCommitStat(sha, commit.parents[0], repoRoot);
  }

  console.log('');
}

function printCommitStat(commitSha: string, parentSha: string, repoRoot: string): void {
  try {
    const commitObj = readObject(commitSha, repoRoot);
    const parentObj = readObject(parentSha, repoRoot);
    const commit = parseCommit(commitObj.content);
    const parent = parseCommit(parentObj.content);

    const commitFiles = collectFiles(commit.tree, repoRoot);
    const parentFiles = collectFiles(parent.tree, repoRoot);

    const changes: { path: string; added: number; deleted: number }[] = [];

    // Find changes
    for (const [path, sha] of commitFiles) {
      const parentSha = parentFiles.get(path);
      if (!parentSha) {
        // New file
        const size = readObject(sha, repoRoot).size;
        changes.push({ path, added: size, deleted: 0 });
      } else if (parentSha !== sha) {
        // Modified file
        changes.push({ path, added: 1, deleted: 1 });
      }
    }

    for (const [path, sha] of parentFiles) {
      if (!commitFiles.has(path)) {
        // Deleted file
        const size = readObject(sha, repoRoot).size;
        changes.push({ path, added: 0, deleted: size });
      }
    }

    if (changes.length > 0) {
      console.log('');
      for (const change of changes) {
        console.log(` ${change.path}`);
      }
      console.log(` ${changes.length} file${changes.length > 1 ? 's' : ''} changed`);
    }
  } catch {
    // Ignore errors in stat generation
  }
}

function collectFiles(treeSha: string, repoRoot: string, prefix: string = ''): Map<string, string> {
  const { parseTree } = require('../objects');
  const files = new Map<string, string>();
  const obj = readObject(treeSha, repoRoot);
  const entries = parseTree(obj.content);

  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'tree') {
      for (const [p, s] of collectFiles(entry.sha, repoRoot, path)) {
        files.set(p, s);
      }
    } else {
      files.set(path, entry.sha);
    }
  }

  return files;
}
