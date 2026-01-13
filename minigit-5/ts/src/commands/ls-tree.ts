// ls-tree command - List tree contents

import { findRepoRoot } from '../utils';
import { resolveRevision } from '../refs';
import { getTree, getTreeFromTreeIsh, readObject } from '../objects';

export function lsTree(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let recursive = false;
  let nameOnly = false;
  let treeIsh: string | null = null;

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
    return 1;
  }

  // Resolve to tree SHA
  let treeSha: string;
  try {
    const sha = resolveRevision(treeIsh, repoRoot);
    treeSha = getTreeFromTreeIsh(sha, repoRoot);
  } catch (e: any) {
    console.error(`fatal: ${e.message}`);
    return 1;
  }

  // List tree
  listTree(treeSha, '', recursive, nameOnly, repoRoot);

  return 0;
}

function listTree(
  treeSha: string,
  prefix: string,
  recursive: boolean,
  nameOnly: boolean,
  repoRoot: string
): void {
  const entries = getTree(treeSha, repoRoot);

  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isDir = entry.mode === '40000';
    const type = isDir ? 'tree' : 'blob';

    if (nameOnly) {
      if (!isDir || !recursive) {
        console.log(fullPath);
      }
    } else {
      // Pad mode for display
      const modeStr = entry.mode === '40000' ? '040000' : entry.mode;
      console.log(`${modeStr} ${type} ${entry.sha}\t${fullPath}`);
    }

    if (recursive && isDir) {
      listTree(entry.sha, fullPath, recursive, nameOnly, repoRoot);
    }
  }
}
