// update-ref command - Update a reference

import { findRepoRoot } from '../utils';
import { updateRef, setHead } from '../refs';

export function updateRefCmd(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  const positionalArgs: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  if (positionalArgs.length < 2) {
    console.error('usage: minigit update-ref <ref> <sha>');
    return 1;
  }

  const ref = positionalArgs[0];
  const sha = positionalArgs[1];

  // Validate SHA format
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    console.error(`fatal: ${sha} is not a valid SHA`);
    return 1;
  }

  // Handle HEAD specially
  if (ref === 'HEAD') {
    setHead(sha, repoRoot);
  } else {
    updateRef(ref, sha, repoRoot);
  }

  return 0;
}
