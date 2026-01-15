// cat-file command - Examine objects

import { findRepoRoot } from '../utils';
import { resolveRef } from '../refs';
import { readObject, parseCommit, parseTree, parseTag, getObjectType, getObjectSize, prettyPrintObject } from '../objects';

export function catFile(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let showType = false;
  let showSize = false;
  let prettyPrint = false;
  let objectType: string | null = null;
  let objectRef: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-t') {
      showType = true;
    } else if (arg === '-s') {
      showSize = true;
    } else if (arg === '-p') {
      prettyPrint = true;
    } else if (arg === 'blob' || arg === 'tree' || arg === 'commit' || arg === 'tag') {
      if (!objectType) {
        objectType = arg;
      } else {
        objectRef = arg;
      }
    } else if (!arg.startsWith('-')) {
      objectRef = arg;
    }
  }

  if (!objectRef) {
    console.error('fatal: object required');
    process.exit(1);
  }

  // Handle path syntax: <commit>:<path>
  if (objectRef.includes(':')) {
    const sha = resolvePath(objectRef, repoRoot);
    if (!sha) {
      console.error(`fatal: bad object ${objectRef}`);
      process.exit(1);
    }
    objectRef = sha;
  }

  // Handle special suffixes like HEAD^{tree}
  const sha = resolveRef(objectRef, repoRoot);
  if (!sha) {
    console.error(`fatal: Not a valid object name ${objectRef}`);
    process.exit(1);
  }

  try {
    if (showType) {
      const type = getObjectType(sha, repoRoot);
      console.log(type);
    } else if (showSize) {
      const size = getObjectSize(sha, repoRoot);
      console.log(size);
    } else if (prettyPrint) {
      const output = prettyPrintObject(sha, repoRoot);
      console.log(output);
    } else if (objectType) {
      // cat-file <type> <object> - verify type and show content
      const obj = readObject(sha, repoRoot);
      if (obj.type !== objectType) {
        console.error(`fatal: git cat-file: ${objectRef} is not a ${objectType}`);
        process.exit(1);
      }
      process.stdout.write(obj.content);
    } else {
      // Default: pretty print
      const output = prettyPrintObject(sha, repoRoot);
      console.log(output);
    }
  } catch (e) {
    console.error(`fatal: git cat-file: ${objectRef}: cannot read object`);
    process.exit(1);
  }
}

function resolvePath(ref: string, repoRoot: string): string | null {
  const colonIndex = ref.indexOf(':');
  const commitRef = ref.slice(0, colonIndex);
  const pathPart = ref.slice(colonIndex + 1);

  const sha = resolveRef(commitRef, repoRoot);
  if (!sha) return null;

  const obj = readObject(sha, repoRoot);
  if (obj.type !== 'commit') return null;

  const commit = parseCommit(obj.content);

  // Navigate tree to find path
  let currentTree = commit.tree;
  const parts = pathPart.split('/').filter(p => p);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const treeObj = readObject(currentTree, repoRoot);
    const entries = parseTree(treeObj.content);

    const entry = entries.find(e => e.name === part);
    if (!entry) return null;

    if (i === parts.length - 1) {
      return entry.sha;
    }

    if (entry.type !== 'tree') return null;
    currentTree = entry.sha;
  }

  return currentTree;
}
