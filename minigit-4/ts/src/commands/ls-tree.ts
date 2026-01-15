// ls-tree command - List tree contents

import { findRepoRoot } from '../utils';
import { readObject, parseCommitContent, parseTreeContent, objectExists } from '../objects';
import { resolveRevision } from '../refs';

export function lsTree(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

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
  let treeSha = resolveRevision(repoRoot, treeIsh);
  if (!treeSha || !objectExists(repoRoot, treeSha)) {
    console.error(`fatal: not a valid object name ${treeIsh}`);
    return 1;
  }

  // If it's a commit, get its tree
  const { type, content } = readObject(repoRoot, treeSha);
  if (type === 'commit') {
    const commitInfo = parseCommitContent(content);
    treeSha = commitInfo.tree;
  } else if (type !== 'tree') {
    console.error(`fatal: not a tree object`);
    return 1;
  }

  listTree(repoRoot, treeSha, '', recursive, nameOnly);
  return 0;
}

function listTree(repoRoot: string, treeSha: string, prefix: string, recursive: boolean, nameOnly: boolean): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isTree = entry.mode === '40000';
    const typeStr = isTree ? 'tree' : 'blob';

    if (recursive && isTree) {
      // Don't print tree entry itself when recursive, just recurse into it
      listTree(repoRoot, entry.sha, fullName, recursive, nameOnly);
    } else if (nameOnly) {
      console.log(fullName);
    } else {
      const modeStr = entry.mode.padStart(6, '0');
      console.log(`${modeStr} ${typeStr} ${entry.sha}\t${fullName}`);
    }
  }
}
