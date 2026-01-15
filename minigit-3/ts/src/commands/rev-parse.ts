// rev-parse command - Resolve revisions

import { findRepoRoot } from '../utils';
import { resolveRef } from '../refs';

export function revParse(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  if (args.length === 0) {
    console.error('fatal: revision required');
    process.exit(1);
  }

  const revision = args[0];
  const sha = resolveRef(revision, repoRoot);

  if (!sha) {
    console.error(`fatal: bad revision '${revision}'`);
    process.exit(1);
  }

  console.log(sha);
}
