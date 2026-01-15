// ls-files command - List indexed files

import { findRepoRoot } from '../utils';
import { readIndex } from '../index-file';

export function lsFiles(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  const showStaged = args.includes('--staged') || args.includes('-s');

  const entries = readIndex(repoRoot);

  for (const entry of entries) {
    if (showStaged) {
      // Format: mode sha stage path
      const modeStr = entry.mode.toString(8).padStart(6, '0');
      const stage = (entry.flags >> 12) & 0x3;
      console.log(`${modeStr} ${entry.sha} ${stage}\t${entry.name}`);
    } else {
      console.log(entry.name);
    }
  }

  return 0;
}
