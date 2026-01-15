// update-ref command - Update reference

import { findRepoRoot } from '../utils';
import { updateRef, writeHead } from '../refs';

export function updateRefCmd(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  if (args.length < 2) {
    console.error('fatal: update-ref requires <ref> <sha>');
    return 1;
  }

  const refName = args[0];
  const sha = args[1];

  // Validate SHA (should be 40 hex chars or abbreviated)
  if (!/^[0-9a-f]{4,40}$/.test(sha)) {
    console.error(`fatal: ${sha} is not a valid SHA`);
    return 1;
  }

  if (refName === 'HEAD') {
    writeHead(repoRoot, sha);
  } else {
    updateRef(repoRoot, refName, sha);
  }

  return 0;
}
