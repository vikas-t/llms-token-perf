// show command - Show object content

import { findRepoRoot, formatDate } from '../utils';
import { resolveRevision, getHeadCommit } from '../refs';
import { readObject, getCommit, getTree, getBlob, parseTag, getTreeFromTreeIsh, walkTree } from '../objects';
import { generateDiff, formatDiff } from '../diff-algo';

export function show(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let target = 'HEAD';
  if (args.length > 0 && !args[0].startsWith('-')) {
    target = args[0];
  }

  // Check for colon syntax (commit:path)
  const colonIndex = target.indexOf(':');
  if (colonIndex !== -1) {
    const commitPart = target.slice(0, colonIndex) || 'HEAD';
    const pathPart = target.slice(colonIndex + 1);

    try {
      const commitSha = resolveRevision(commitPart, repoRoot);
      const treeSha = getTreeFromTreeIsh(commitSha, repoRoot);
      const files = walkTree(treeSha, '', repoRoot);

      const entry = files.get(pathPart);
      if (!entry) {
        console.error(`fatal: path '${pathPart}' does not exist in '${commitPart}'`);
        return 1;
      }

      const content = getBlob(entry.sha, repoRoot);
      process.stdout.write(content);
      return 0;
    } catch (e: any) {
      console.error(`fatal: ${e.message}`);
      return 1;
    }
  }

  // Resolve revision
  let sha: string;
  try {
    sha = resolveRevision(target, repoRoot);
  } catch (e: any) {
    console.error(`fatal: ${e.message}`);
    return 1;
  }

  // Get object
  const { type, content } = readObject(sha, repoRoot);

  switch (type) {
    case 'commit':
      return showCommit(sha, content, repoRoot);
    case 'tree':
      return showTree(sha, repoRoot);
    case 'blob':
      process.stdout.write(content);
      return 0;
    case 'tag':
      return showTag(sha, content, repoRoot);
    default:
      console.error(`Unknown object type: ${type}`);
      return 1;
  }
}

function showCommit(sha: string, content: Buffer, repoRoot: string): number {
  const commit = getCommit(sha, repoRoot);

  console.log(`commit ${sha}`);

  // Parse author
  const authorMatch = commit.author.match(/^(.+) <(.+)> (\d+) ([+-]\d{4})$/);
  if (authorMatch) {
    console.log(`Author: ${authorMatch[1]} <${authorMatch[2]}>`);
    const date = new Date(parseInt(authorMatch[3], 10) * 1000);
    console.log(`Date:   ${formatDate(date)}`);
  }

  console.log('');
  const messageLines = commit.message.split('\n');
  for (const line of messageLines) {
    console.log(`    ${line}`);
  }
  console.log('');

  // Show diff from parent
  if (commit.parents.length > 0) {
    const parentSha = commit.parents[0];
    const parentTree = getTreeFromTreeIsh(parentSha, repoRoot);
    const currentTree = commit.tree;

    const parentFiles = walkTree(parentTree, '', repoRoot);
    const currentFiles = walkTree(currentTree, '', repoRoot);

    // Show diff
    const allPaths = new Set([...parentFiles.keys(), ...currentFiles.keys()]);

    for (const filePath of allPaths) {
      const parentEntry = parentFiles.get(filePath);
      const currentEntry = currentFiles.get(filePath);

      if (!parentEntry && currentEntry) {
        // New file
        const newContent = getBlob(currentEntry.sha, repoRoot).toString();
        const diff = generateDiff('', newContent, '/dev/null', filePath);
        process.stdout.write(formatDiff({ ...diff, oldPath: '/dev/null', newPath: filePath }));
      } else if (parentEntry && !currentEntry) {
        // Deleted file
        const oldContent = getBlob(parentEntry.sha, repoRoot).toString();
        const diff = generateDiff(oldContent, '', filePath, '/dev/null');
        process.stdout.write(formatDiff({ ...diff, oldPath: filePath, newPath: '/dev/null' }));
      } else if (parentEntry && currentEntry && parentEntry.sha !== currentEntry.sha) {
        // Modified
        const oldContent = getBlob(parentEntry.sha, repoRoot).toString();
        const newContent = getBlob(currentEntry.sha, repoRoot).toString();
        const diff = generateDiff(oldContent, newContent, filePath, filePath);
        if (diff.hunks.length > 0) {
          process.stdout.write(formatDiff(diff));
        }
      }
    }
  } else {
    // Initial commit - show all files as added
    const currentTree = commit.tree;
    const currentFiles = walkTree(currentTree, '', repoRoot);

    for (const [filePath, entry] of currentFiles) {
      const content = getBlob(entry.sha, repoRoot).toString();
      const diff = generateDiff('', content, '/dev/null', filePath);
      process.stdout.write(formatDiff({ ...diff, oldPath: '/dev/null', newPath: filePath }));
    }
  }

  return 0;
}

function showTree(sha: string, repoRoot: string): number {
  const entries = getTree(sha, repoRoot);

  for (const entry of entries) {
    const type = entry.mode === '40000' ? 'tree' : 'blob';
    console.log(`${entry.mode} ${type} ${entry.sha}\t${entry.name}`);
  }

  return 0;
}

function showTag(sha: string, content: Buffer, repoRoot: string): number {
  const tag = parseTag(content);

  console.log(`tag ${tag.tagName}`);
  console.log(`Tagger: ${tag.tagger}`);
  console.log('');
  console.log(tag.message);
  console.log('');

  // Show the tagged object
  const { type } = readObject(tag.object, repoRoot);
  console.log(`Tagged ${type}: ${tag.object}`);

  return 0;
}
