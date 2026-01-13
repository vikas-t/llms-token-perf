// ls-files command - List indexed files

import { findRepoRoot } from '../utils';
import { readIndex } from '../index-file';

export function lsFiles(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let showStaged = false;

  for (const arg of args) {
    if (arg === '--staged' || arg === '-s') {
      showStaged = true;
    }
  }

  // Read index
  const index = readIndex(repoRoot);
  const entries = index.entries.slice().sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of entries) {
    if (showStaged) {
      // Format: mode sha stage path
      const mode = entry.mode.toString(8).padStart(6, '0');
      const stage = 0; // Stage is always 0 for regular index entries
      console.log(`${mode} ${entry.sha} ${stage}\t${entry.path}`);
    } else {
      console.log(entry.path);
    }
  }

  return 0;
}
