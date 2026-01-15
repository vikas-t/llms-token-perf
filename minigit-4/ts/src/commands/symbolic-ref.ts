// symbolic-ref command - Manage symbolic refs

import { findRepoRoot } from '../utils';
import { readSymbolicRef, writeSymbolicRef } from '../refs';

export function symbolicRef(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  if (args.length === 0) {
    console.error('fatal: symbolic-ref requires <name>');
    return 1;
  }

  const name = args[0];
  const target = args[1];

  if (target) {
    // Set symbolic ref
    writeSymbolicRef(repoRoot, name, target);
    return 0;
  }

  // Read symbolic ref
  const value = readSymbolicRef(repoRoot, name);

  if (!value) {
    console.error(`fatal: ref ${name} is not a symbolic ref`);
    return 1;
  }

  console.log(value);
  return 0;
}
