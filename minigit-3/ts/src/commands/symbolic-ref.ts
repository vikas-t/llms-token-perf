// symbolic-ref command - Manage symbolic references

import { findRepoRoot } from '../utils';
import { getSymbolicRef, setSymbolicRef } from '../refs';

export function symbolicRef(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  if (args.length === 0) {
    console.error('usage: symbolic-ref <name> [<ref>]');
    process.exit(1);
  }

  const refName = args[0];
  const targetRef = args[1];

  if (targetRef) {
    // Set symbolic ref
    setSymbolicRef(refName, targetRef, repoRoot);
  } else {
    // Read symbolic ref
    const target = getSymbolicRef(refName, repoRoot);
    if (target) {
      console.log(target);
    } else {
      console.error(`fatal: ref ${refName} is not a symbolic ref`);
      process.exit(1);
    }
  }
}
