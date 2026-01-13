// symbolic-ref command - Manage symbolic references

import { findRepoRoot } from '../utils';
import { getSymbolicRef, setSymbolicRef, getHead } from '../refs';

export function symbolicRef(args: string[]): number {
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

  if (positionalArgs.length === 0) {
    console.error('usage: minigit symbolic-ref <name> [<ref>]');
    return 1;
  }

  const refName = positionalArgs[0];

  if (positionalArgs.length === 1) {
    // Read mode
    if (refName === 'HEAD') {
      const head = getHead(repoRoot);
      if (head.startsWith('ref:')) {
        console.log(head.slice(5).trim());
        return 0;
      } else {
        console.error('fatal: ref HEAD is not a symbolic ref');
        return 1;
      }
    }

    const target = getSymbolicRef(refName, repoRoot);
    if (target) {
      console.log(target);
      return 0;
    } else {
      console.error(`fatal: ref ${refName} is not a symbolic ref`);
      return 1;
    }
  }

  // Write mode
  const target = positionalArgs[1];

  if (refName === 'HEAD') {
    const { setHead } = require('../refs');
    setHead(`ref: ${target}`, repoRoot);
  } else {
    setSymbolicRef(refName, target, repoRoot);
  }

  return 0;
}
