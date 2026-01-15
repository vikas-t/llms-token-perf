// ls-files command - List indexed files

import { findRepoRoot } from '../utils';
import { readIndex } from '../index-file';

export function lsFiles(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let showStaged = false;

  // Parse arguments
  for (const arg of args) {
    if (arg === '--stage' || arg === '--staged' || arg === '-s') {
      showStaged = true;
    }
  }

  const entries = readIndex(repoRoot);

  for (const entry of entries) {
    if (showStaged) {
      const mode = entry.mode.toString(8).padStart(6, '0');
      const stage = 0; // Stage 0 for normal entries
      console.log(`${mode} ${entry.sha} ${stage}\t${entry.name}`);
    } else {
      console.log(entry.name);
    }
  }
}
