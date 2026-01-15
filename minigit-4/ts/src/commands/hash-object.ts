// hash-object command - Compute object hash

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../utils';
import { createBlobContent, hashObject, writeObject } from '../objects';

export function hashObjectCmd(args: string[]): number {
  let write = false;
  let objectType = 'blob';
  let filePath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-w') {
      write = true;
    } else if (args[i] === '-t' && i + 1 < args.length) {
      objectType = args[++i];
    } else if (!args[i].startsWith('-')) {
      filePath = args[i];
    }
  }

  if (!filePath) {
    console.error('fatal: file path required');
    return 1;
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`fatal: could not open '${filePath}' for reading: No such file or directory`);
    return 1;
  }

  const content = fs.readFileSync(absolutePath);

  // Currently only blob type is fully supported
  let objectContent: Buffer;
  if (objectType === 'blob') {
    objectContent = createBlobContent(content);
  } else {
    // For other types, just use blob format for now
    const header = `${objectType} ${content.length}\0`;
    objectContent = Buffer.concat([Buffer.from(header), content]);
  }

  const sha = hashObject(objectContent);

  if (write) {
    const repoRoot = findRepoRoot();
    if (!repoRoot) {
      console.error('fatal: not a minigit repository');
      return 1;
    }
    writeObject(repoRoot, objectContent);
  }

  console.log(sha);
  return 0;
}
