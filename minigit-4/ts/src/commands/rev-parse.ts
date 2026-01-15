// rev-parse command - Resolve revisions

import { findRepoRoot } from '../utils';
import { resolveRevision } from '../refs';

export function revParse(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  if (args.length === 0) {
    console.error('fatal: revision required');
    return 1;
  }

  const rev = args[0];
  const sha = resolveRevision(repoRoot, rev);

  if (!sha) {
    console.error(`fatal: ambiguous argument '${rev}': unknown revision`);
    return 1;
  }

  console.log(sha);
  return 0;
}
