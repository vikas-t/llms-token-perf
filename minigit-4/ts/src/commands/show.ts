// show command - Show object content

import { findRepoRoot, formatTimestamp, shortSha } from '../utils';
import { readObject, parseCommitContent, parseTreeContent, parseTagContent, objectExists } from '../objects';
import { resolveRevision, getHeadCommit } from '../refs';
import { formatUnifiedDiff } from '../diff-algo';

export function show(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  const ref = args[0] || 'HEAD';

  // Check for commit:path syntax
  if (ref.includes(':')) {
    const [commitRef, pathPart] = ref.split(':');
    return showFileAtCommit(repoRoot, commitRef, pathPart);
  }

  const sha = resolveRevision(repoRoot, ref);
  if (!sha) {
    console.error(`fatal: bad object ${ref}`);
    return 1;
  }

  if (!objectExists(repoRoot, sha)) {
    console.error(`fatal: bad object ${ref}`);
    return 1;
  }

  const { type, content } = readObject(repoRoot, sha);

  switch (type) {
    case 'commit':
      return showCommit(repoRoot, sha, content);
    case 'tree':
      return showTree(repoRoot, sha, content);
    case 'blob':
      return showBlob(content);
    case 'tag':
      return showTag(repoRoot, sha, content);
    default:
      console.error(`Unknown object type: ${type}`);
      return 1;
  }
}

function showCommit(repoRoot: string, sha: string, content: Buffer): number {
  const info = parseCommitContent(content);

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

  // Show diff from parent
  if (info.parents.length > 0) {
    const parentSha = info.parents[0];
    const diff = diffCommits(repoRoot, parentSha, sha);
    if (diff) {
      console.log(diff);
    }
  } else {
    // Initial commit - show all files as added
    const diff = diffCommits(repoRoot, null, sha);
    if (diff) {
      console.log(diff);
    }
  }

  return 0;
}

function showTree(repoRoot: string, sha: string, content: Buffer): number {
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const typeStr = entry.mode === '40000' ? 'tree' : 'blob';
    console.log(`${entry.mode} ${typeStr} ${entry.sha}\t${entry.name}`);
  }

  return 0;
}

function showBlob(content: Buffer): number {
  process.stdout.write(content);
  return 0;
}

function showTag(repoRoot: string, sha: string, content: Buffer): number {
  const info = parseTagContent(content);

  console.log(`tag ${info.tag}`);
  console.log(`Tagger: ${info.tagger} <${info.taggerEmail}>`);
  console.log(`Date:   ${formatTimestamp(info.taggerTimestamp, info.taggerTz)}`);
  console.log('');
  console.log(info.message);
  console.log('');

  // Show the tagged object
  const targetSha = resolveRevision(repoRoot, info.object);
  if (targetSha && objectExists(repoRoot, targetSha)) {
    const { type, content: targetContent } = readObject(repoRoot, targetSha);
    if (type === 'commit') {
      return showCommit(repoRoot, targetSha, targetContent);
    }
  }

  return 0;
}

function showFileAtCommit(repoRoot: string, commitRef: string, filePath: string): number {
  const sha = resolveRevision(repoRoot, `${commitRef}:${filePath}`);
  if (!sha) {
    console.error(`fatal: path '${filePath}' does not exist in '${commitRef}'`);
    return 1;
  }

  const { type, content } = readObject(repoRoot, sha);
  if (type !== 'blob') {
    console.error(`fatal: '${filePath}' is not a file`);
    return 1;
  }

  process.stdout.write(content);
  return 0;
}

function diffCommits(repoRoot: string, parentSha: string | null, commitSha: string): string {
  const parentFiles = new Map<string, string>();
  const commitFiles = new Map<string, string>();

  if (parentSha) {
    const { content } = readObject(repoRoot, parentSha);
    const info = parseCommitContent(content);
    collectTreeFiles(repoRoot, info.tree, '', parentFiles);
  }

  const { content } = readObject(repoRoot, commitSha);
  const info = parseCommitContent(content);
  collectTreeFiles(repoRoot, info.tree, '', commitFiles);

  const diffs: string[] = [];
  const allFiles = new Set([...parentFiles.keys(), ...commitFiles.keys()]);

  for (const name of [...allFiles].sort()) {
    const parentFileSha = parentFiles.get(name);
    const commitFileSha = commitFiles.get(name);

    if (parentFileSha === commitFileSha) {
      continue;
    }

    let oldContent = '';
    let newContent = '';

    if (parentFileSha) {
      const { content } = readObject(repoRoot, parentFileSha);
      oldContent = content.toString();
    }

    if (commitFileSha) {
      const { content } = readObject(repoRoot, commitFileSha);
      newContent = content.toString();
    }

    const diff = formatUnifiedDiff(name, name, oldContent, newContent);
    if (diff) {
      diffs.push(diff);
    }
  }

  return diffs.join('');
}

function collectTreeFiles(repoRoot: string, treeSha: string, prefix: string, files: Map<string, string>): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      collectTreeFiles(repoRoot, entry.sha, fullName, files);
    } else {
      files.set(fullName, entry.sha);
    }
  }
}
