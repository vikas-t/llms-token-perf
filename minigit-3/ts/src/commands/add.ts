// add command - Stage files for commit

import * as fs from 'fs';
import * as path from 'path';
import { IndexEntry } from '../types';
import { findRepoRoot, getFileMode, normalizePath } from '../utils';
import { writeBlob } from '../objects';
import { readIndex, writeIndex, removeFromIndex } from '../index-file';

export function add(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let pathspecs: string[] = [];
  let updateOnly = false;
  let all = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-A' || arg === '--all') {
      all = true;
    } else if (arg === '-u' || arg === '--update') {
      updateOnly = true;
    } else {
      pathspecs.push(arg);
    }
  }

  if (all) {
    pathspecs = ['.'];
  }

  if (pathspecs.length === 0 && !updateOnly) {
    console.error('Nothing specified, nothing added.');
    process.exit(0);
  }

  const entries = readIndex(repoRoot);
  const trackedFiles = new Set(entries.map(e => e.name));
  const newEntries = new Map<string, IndexEntry>();

  // Copy existing entries
  for (const entry of entries) {
    newEntries.set(entry.name, entry);
  }

  // Get all files to potentially add
  const filesToProcess: string[] = [];

  if (updateOnly) {
    // Only process tracked files
    for (const entry of entries) {
      const fullPath = path.join(repoRoot, entry.name);
      if (fs.existsSync(fullPath)) {
        filesToProcess.push(entry.name);
      } else {
        // File deleted - mark for removal
        newEntries.delete(entry.name);
      }
    }
  } else {
    // Process specified pathspecs
    for (const pathspec of pathspecs) {
      const absPath = path.resolve(process.cwd(), pathspec);
      const relPath = path.relative(repoRoot, absPath);

      if (!fs.existsSync(absPath)) {
        console.error(`fatal: pathspec '${pathspec}' did not match any files`);
        process.exit(1);
      }

      if (fs.statSync(absPath).isDirectory()) {
        // Add all files in directory
        addDirectory(absPath, repoRoot, filesToProcess, all);
      } else {
        filesToProcess.push(normalizePath(relPath));
      }
    }
  }

  // Process each file
  for (const relPath of filesToProcess) {
    const absPath = path.join(repoRoot, relPath);

    if (!fs.existsSync(absPath)) {
      // File deleted
      if (all || updateOnly) {
        newEntries.delete(relPath);
      }
      continue;
    }

    const stats = fs.statSync(absPath);

    if (stats.isSymbolicLink()) {
      // Handle symlink
      const target = fs.readlinkSync(absPath);
      const sha = writeBlob(Buffer.from(target), repoRoot);
      const entry = createIndexEntry(relPath, sha, 0o120000, stats);
      newEntries.set(relPath, entry);
    } else if (stats.isFile()) {
      const content = fs.readFileSync(absPath);
      const sha = writeBlob(content, repoRoot);
      const mode = getFileMode(absPath);
      const entry = createIndexEntry(relPath, sha, mode, stats);
      newEntries.set(relPath, entry);
    }
  }

  // Handle -A flag: also remove deleted files
  if (all) {
    for (const entry of entries) {
      const fullPath = path.join(repoRoot, entry.name);
      if (!fs.existsSync(fullPath)) {
        newEntries.delete(entry.name);
      }
    }
  }

  // Write updated index
  writeIndex(Array.from(newEntries.values()), repoRoot);
}

function addDirectory(dirPath: string, repoRoot: string, files: string[], includeNew: boolean): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip .minigit directory
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = normalizePath(path.relative(repoRoot, fullPath));

    if (entry.isDirectory()) {
      addDirectory(fullPath, repoRoot, files, includeNew);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(relPath);
    }
  }
}

function createIndexEntry(name: string, sha: string, mode: number, stats: fs.Stats): IndexEntry {
  const now = Math.floor(Date.now() / 1000);
  return {
    ctimeSec: Math.floor(stats.ctimeMs / 1000),
    ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
    mtimeSec: Math.floor(stats.mtimeMs / 1000),
    mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
    dev: stats.dev,
    ino: stats.ino,
    mode,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    sha,
    flags: Math.min(name.length, 0xfff),
    name
  };
}
