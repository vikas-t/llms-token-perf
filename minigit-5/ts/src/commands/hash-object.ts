// hash-object command - Compute object hash

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../utils';
import { hashObject, writeObject } from '../objects';

export function hashObjectCmd(args: string[]): number {
  // Parse arguments
  let write = false;
  let objectType = 'blob';
  let filePath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-w') {
      write = true;
    } else if (arg === '-t' && i + 1 < args.length) {
      objectType = args[i + 1];
      i++;
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('fatal: file path required');
    return 1;
  }

  // Resolve file path
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`fatal: could not read file '${filePath}'`);
    return 1;
  }

  const content = fs.readFileSync(resolvedPath);

  if (write) {
    const repoRoot = findRepoRoot();
    if (!repoRoot) {
      console.error('fatal: not a minigit repository');
      return 1;
    }
    const sha = writeObject(objectType, content, repoRoot);
    console.log(sha);
  } else {
    const sha = hashObject(objectType, content);
    console.log(sha);
  }

  return 0;
}
