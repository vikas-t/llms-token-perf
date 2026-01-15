// init command - Initialize a new repository

import * as fs from 'fs';
import * as path from 'path';
import { ensureDir } from '../utils';

export function init(args: string[]): void {
  const targetDir = args[0] || process.cwd();
  const absPath = path.resolve(targetDir);
  const gitDir = path.join(absPath, '.minigit');

  if (fs.existsSync(gitDir)) {
    console.error(`Reinitialized existing Git repository in ${gitDir}/`);
    process.exit(1);
  }

  // Create directory structure
  ensureDir(gitDir);
  ensureDir(path.join(gitDir, 'objects'));
  ensureDir(path.join(gitDir, 'objects', 'info'));
  ensureDir(path.join(gitDir, 'objects', 'pack'));
  ensureDir(path.join(gitDir, 'refs'));
  ensureDir(path.join(gitDir, 'refs', 'heads'));
  ensureDir(path.join(gitDir, 'refs', 'tags'));

  // Create HEAD
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

  // Create config file
  fs.writeFileSync(path.join(gitDir, 'config'), '');

  console.log(`Initialized empty Git repository in ${gitDir}/`);
}
