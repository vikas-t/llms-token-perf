// show command - Show object content

import { findRepoRoot, shortSha, formatDate, parseTimestamp } from '../utils';
import { resolveRef, getHeadCommit } from '../refs';
import { readObject, parseCommit, parseTree, parseTag as parseTagObject } from '../objects';
import { diffFiles, formatDiff } from '../diff-algo';

export function show(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  const objectRef = args[0] || 'HEAD';

  // Check for path syntax: <commit>:<path>
  if (objectRef.includes(':')) {
    showObjectAtPath(objectRef, repoRoot);
    return;
  }

  const sha = resolveRef(objectRef, repoRoot);
  if (!sha) {
    console.error(`fatal: bad object ${objectRef}`);
    process.exit(1);
  }

  const obj = readObject(sha, repoRoot);

  switch (obj.type) {
    case 'commit':
      showCommit(sha, obj.content, repoRoot);
      break;
    case 'tree':
      showTree(sha, obj.content, repoRoot);
      break;
    case 'blob':
      console.log(obj.content.toString());
      break;
    case 'tag':
      showTag(sha, obj.content, repoRoot);
      break;
    default:
      console.log(obj.content.toString());
  }
}

function showCommit(sha: string, content: Buffer, repoRoot: string): void {
  const commit = parseCommit(content);

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
  console.log('');

  // Show diff from parent
  if (commit.parents.length > 0) {
    const parentSha = commit.parents[0];
    showCommitDiff(parentSha, sha, repoRoot);
  } else {
    // Initial commit - show all files as added
    showInitialCommitDiff(commit.tree, repoRoot);
  }
}

function showCommitDiff(parentSha: string, commitSha: string, repoRoot: string): void {
  const parentCommit = parseCommit(readObject(parentSha, repoRoot).content);
  const commit = parseCommit(readObject(commitSha, repoRoot).content);

  const parentFiles = new Map<string, { sha: string; mode: string }>();
  const commitFiles = new Map<string, { sha: string; mode: string }>();

  collectTreeFilesWithMode(parentCommit.tree, '', repoRoot, parentFiles);
  collectTreeFilesWithMode(commit.tree, '', repoRoot, commitFiles);

  const allPaths = new Set([...parentFiles.keys(), ...commitFiles.keys()]);

  for (const name of [...allPaths].sort()) {
    const parentEntry = parentFiles.get(name);
    const commitEntry = commitFiles.get(name);

    if (!parentEntry && commitEntry) {
      // New file
      const obj = readObject(commitEntry.sha, repoRoot);
      const diff = diffFiles('', obj.content.toString(), {
        oldPath: name,
        newPath: name,
        newMode: commitEntry.mode
      });
      diff.isNew = true;
      console.log(formatDiff(diff));
    } else if (parentEntry && !commitEntry) {
      // Deleted file
      const obj = readObject(parentEntry.sha, repoRoot);
      const diff = diffFiles(obj.content.toString(), '', {
        oldPath: name,
        newPath: name,
        oldMode: parentEntry.mode
      });
      diff.isDeleted = true;
      console.log(formatDiff(diff));
    } else if (parentEntry && commitEntry && parentEntry.sha !== commitEntry.sha) {
      // Modified file
      const parentObj = readObject(parentEntry.sha, repoRoot);
      const commitObj = readObject(commitEntry.sha, repoRoot);
      const diff = diffFiles(parentObj.content.toString(), commitObj.content.toString(), {
        oldPath: name,
        newPath: name,
        oldMode: parentEntry.mode,
        newMode: commitEntry.mode
      });
      console.log(formatDiff(diff));
    }
  }
}

function showInitialCommitDiff(treeSha: string, repoRoot: string): void {
  const files = new Map<string, { sha: string; mode: string }>();
  collectTreeFilesWithMode(treeSha, '', repoRoot, files);

  for (const [name, entry] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
    const obj = readObject(entry.sha, repoRoot);
    const diff = diffFiles('', obj.content.toString(), {
      oldPath: name,
      newPath: name,
      newMode: entry.mode
    });
    diff.isNew = true;
    console.log(formatDiff(diff));
  }
}

function showTree(sha: string, content: Buffer, repoRoot: string): void {
  const entries = parseTree(content);

  for (const entry of entries) {
    const type = entry.mode.startsWith('40') ? 'tree' : 'blob';
    console.log(`${entry.mode} ${type} ${entry.sha}\t${entry.name}`);
  }
}

function showTag(sha: string, content: Buffer, repoRoot: string): void {
  const tag = parseTagObject(content);

  console.log(`tag ${tag.tag}`);
  console.log(`Tagger: ${tag.tagger}`);
  console.log('');
  console.log(tag.message);
  console.log('');

  // Show referenced object
  const obj = readObject(tag.object, repoRoot);
  if (obj.type === 'commit') {
    showCommit(tag.object, obj.content, repoRoot);
  }
}

function showObjectAtPath(ref: string, repoRoot: string): void {
  const colonIndex = ref.indexOf(':');
  const commitRef = ref.slice(0, colonIndex);
  const pathPart = ref.slice(colonIndex + 1);

  const sha = resolveRef(commitRef, repoRoot);
  if (!sha) {
    console.error(`fatal: bad revision '${commitRef}'`);
    process.exit(1);
  }

  const obj = readObject(sha, repoRoot);
  if (obj.type !== 'commit') {
    console.error(`fatal: '${commitRef}' is not a commit`);
    process.exit(1);
  }

  const commit = parseCommit(obj.content);
  const files = new Map<string, { sha: string; mode: string }>();
  collectTreeFilesWithMode(commit.tree, '', repoRoot, files);

  const entry = files.get(pathPart);
  if (!entry) {
    console.error(`fatal: path '${pathPart}' does not exist in '${commitRef}'`);
    process.exit(1);
  }

  const blobObj = readObject(entry.sha, repoRoot);
  console.log(blobObj.content.toString());
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
