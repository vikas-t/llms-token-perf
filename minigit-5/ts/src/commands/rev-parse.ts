// rev-parse command - Resolve revisions

import { findRepoRoot } from '../utils';
import { resolveRevision } from '../refs';

export function revParse(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  const revisions: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith('-')) {
      revisions.push(arg);
    }
  }

  if (revisions.length === 0) {
    console.error('fatal: revision required');
    return 1;
  }

  for (const rev of revisions) {
    try {
      const sha = resolveRevision(rev, repoRoot);
      console.log(sha);
    } catch (e: any) {
      console.error(`fatal: ${e.message}`);
      return 1;
    }
  }

  return 0;
}
