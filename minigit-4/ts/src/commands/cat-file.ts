// cat-file command - Examine objects

import { findRepoRoot } from '../utils';
import { readObject, parseCommitContent, parseTreeContent, parseTagContent, objectExists, resolveShortSha } from '../objects';
import { resolveRevision } from '../refs';

export function catFile(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let showType = false;
  let showSize = false;
  let prettyPrint = false;
  let objectType: string | null = null;
  let objectRef: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-t') {
      showType = true;
    } else if (args[i] === '-s') {
      showSize = true;
    } else if (args[i] === '-p') {
      prettyPrint = true;
    } else if (['blob', 'tree', 'commit', 'tag'].includes(args[i])) {
      objectType = args[i];
    } else if (!args[i].startsWith('-')) {
      objectRef = args[i];
    }
  }

  if (!objectRef) {
    console.error('fatal: object reference required');
    return 1;
  }

  // Resolve the object reference
  let sha = resolveRevision(repoRoot, objectRef);

  if (!sha) {
    // Try as short SHA
    sha = resolveShortSha(repoRoot, objectRef);
  }

  if (!sha || !objectExists(repoRoot, sha)) {
    console.error(`fatal: Not a valid object name ${objectRef}`);
    return 1;
  }

  const { type, size, content } = readObject(repoRoot, sha);

  if (showType) {
    console.log(type);
    return 0;
  }

  if (showSize) {
    console.log(size);
    return 0;
  }

  if (prettyPrint) {
    return prettyPrintObject(repoRoot, type, content);
  }

  if (objectType) {
    if (objectType !== type) {
      console.error(`fatal: expected ${objectType} but got ${type}`);
      return 1;
    }
    process.stdout.write(content);
    return 0;
  }

  // Default: show content
  process.stdout.write(content);
  return 0;
}

function prettyPrintObject(repoRoot: string, type: string, content: Buffer): number {
  switch (type) {
    case 'blob':
      process.stdout.write(content);
      return 0;

    case 'tree':
      return prettyPrintTree(content);

    case 'commit':
      return prettyPrintCommit(content);

    case 'tag':
      return prettyPrintTag(content);

    default:
      console.error(`Unknown object type: ${type}`);
      return 1;
  }
}

function prettyPrintTree(content: Buffer): number {
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const typeStr = entry.mode === '40000' ? 'tree' : 'blob';
    // Pad mode to 6 characters
    const modeStr = entry.mode.padStart(6, '0');
    console.log(`${modeStr} ${typeStr} ${entry.sha}\t${entry.name}`);
  }

  return 0;
}

function prettyPrintCommit(content: Buffer): number {
  const info = parseCommitContent(content);

  console.log(`tree ${info.tree}`);
  for (const parent of info.parents) {
    console.log(`parent ${parent}`);
  }
  console.log(`author ${info.author} <${info.authorEmail}> ${info.authorTimestamp} ${info.authorTz}`);
  console.log(`committer ${info.committer} <${info.committerEmail}> ${info.committerTimestamp} ${info.committerTz}`);
  console.log('');
  console.log(info.message);

  return 0;
}

function prettyPrintTag(content: Buffer): number {
  const info = parseTagContent(content);

  console.log(`object ${info.object}`);
  console.log(`type ${info.type}`);
  console.log(`tag ${info.tag}`);
  console.log(`tagger ${info.tagger} <${info.taggerEmail}> ${info.taggerTimestamp} ${info.taggerTz}`);
  console.log('');
  console.log(info.message);

  return 0;
}
