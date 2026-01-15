// init command - Initialize repository

import * as fs from 'fs';
import * as path from 'path';
import { ensureDir } from '../utils';

export function init(args: string[]): number {
  const targetDir = args[0] ? path.resolve(args[0]) : process.cwd();
  const minigitDir = path.join(targetDir, '.minigit');

  // Check if already exists
  if (fs.existsSync(minigitDir)) {
    console.error(`fatal: repository already exists in ${minigitDir}`);
    return 1;
  }

  // Create directory structure
  ensureDir(minigitDir);
  ensureDir(path.join(minigitDir, 'objects'));
  ensureDir(path.join(minigitDir, 'objects', 'info'));
  ensureDir(path.join(minigitDir, 'objects', 'pack'));
  ensureDir(path.join(minigitDir, 'refs'));
  ensureDir(path.join(minigitDir, 'refs', 'heads'));
  ensureDir(path.join(minigitDir, 'refs', 'tags'));

  // Create HEAD file
  fs.writeFileSync(path.join(minigitDir, 'HEAD'), 'ref: refs/heads/main\n');

  // Create config file
  fs.writeFileSync(path.join(minigitDir, 'config'), '');

  console.log(`Initialized empty minigit repository in ${minigitDir}`);
  return 0;
}
