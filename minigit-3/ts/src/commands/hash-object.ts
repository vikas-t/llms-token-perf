// hash-object command - Compute object hash

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, sha1 } from '../utils';
import { writeBlob, createBlobContent, hashObject, writeObject } from '../objects';

export function hashObjectCmd(args: string[]): void {
  let writeFlag = false;
  let objectType = 'blob';
  let filePath: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-w') {
      writeFlag = true;
    } else if (arg === '-t' && i + 1 < args.length) {
      objectType = args[++i];
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('fatal: file required');
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`fatal: could not open '${filePath}' for reading: No such file or directory`);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath);

  // Create object content with header
  const header = `${objectType} ${content.length}\0`;
  const fullContent = Buffer.concat([Buffer.from(header), content]);
  const hash = sha1(fullContent);

  if (writeFlag) {
    const repoRoot = findRepoRoot();
    if (!repoRoot) {
      console.error('fatal: not a git repository');
      process.exit(1);
    }
    writeObject(fullContent, repoRoot);
  }

  console.log(hash);
}
