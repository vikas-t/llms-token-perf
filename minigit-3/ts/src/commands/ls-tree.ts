// ls-tree command - List tree contents

import { findRepoRoot } from '../utils';
import { resolveRef } from '../refs';
import { readObject, parseCommit, parseTree } from '../objects';

export function lsTree(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let recursive = false;
  let nameOnly = false;
  let treeIsh: string | null = null;

  // Parse arguments
  for (const arg of args) {
    if (arg === '-r') {
      recursive = true;
    } else if (arg === '--name-only') {
      nameOnly = true;
    } else if (!arg.startsWith('-')) {
      treeIsh = arg;
    }
  }

  if (!treeIsh) {
    console.error('fatal: tree-ish required');
    process.exit(1);
  }

  // Resolve tree-ish
  let treeSha = resolveRef(treeIsh, repoRoot);
  if (!treeSha) {
    console.error(`fatal: not a valid object name ${treeIsh}`);
    process.exit(1);
  }

  // If it's a commit, get its tree
  const obj = readObject(treeSha, repoRoot);
  if (obj.type === 'commit') {
    const commit = parseCommit(obj.content);
    treeSha = commit.tree;
  } else if (obj.type !== 'tree') {
    console.error(`fatal: ${treeIsh} is not a tree`);
    process.exit(1);
  }

  // List tree contents
  listTree(treeSha, '', recursive, nameOnly, repoRoot);
}

function listTree(treeSha: string, prefix: string, recursive: boolean, nameOnly: boolean, repoRoot: string): void {
  const obj = readObject(treeSha, repoRoot);
  const entries = parseTree(obj.content);

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const type = entry.mode === '040000' || entry.mode.startsWith('40') ? 'tree' : 'blob';

    if (nameOnly) {
      if (type === 'tree' && recursive) {
        listTree(entry.sha, name, recursive, nameOnly, repoRoot);
      } else if (type === 'blob') {
        console.log(name);
      }
    } else {
      console.log(`${entry.mode} ${type} ${entry.sha}\t${name}`);

      if (type === 'tree' && recursive) {
        listTree(entry.sha, name, recursive, nameOnly, repoRoot);
      }
    }
  }
}
