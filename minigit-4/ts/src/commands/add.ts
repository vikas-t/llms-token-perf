// add command - Stage files for commit

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePathSeparator, getFileModeFromStat } from '../utils';
import { readIndex, writeIndex, createIndexEntryFromFile, addToIndex, removeFromIndex } from '../index-file';
import { createBlobFromFile, createBlobFromSymlink } from '../objects';

export function add(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let all = false;
  let update = false;
  const paths: string[] = [];

  for (const arg of args) {
    if (arg === '-A' || arg === '--all') {
      all = true;
    } else if (arg === '-u' || arg === '--update') {
      update = true;
    } else {
      paths.push(arg);
    }
  }

  let entries = readIndex(repoRoot);

  if (all) {
    // Stage all changes (new, modified, deleted)
    entries = addAllChanges(repoRoot, entries);
  } else if (update) {
    // Stage only tracked file modifications and deletions
    entries = updateTrackedFiles(repoRoot, entries);
  } else if (paths.length === 0) {
    console.error('fatal: no pathspec given');
    return 1;
  } else {
    // Stage specific paths
    for (const p of paths) {
      const result = addPath(repoRoot, entries, p);
      if (result.error) {
        console.error(result.error);
        return 1;
      }
      entries = result.entries;
    }
  }

  writeIndex(repoRoot, entries);
  return 0;
}

function addPath(
  repoRoot: string,
  entries: ReturnType<typeof readIndex>,
  pathSpec: string
): { entries: ReturnType<typeof readIndex>; error?: string } {
  const fullPath = path.resolve(repoRoot, pathSpec);

  // Check if path exists
  if (!fs.existsSync(fullPath)) {
    // Check if it was a tracked file that was deleted
    const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));
    const existingEntry = entries.find((e) => e.name === relativePath);
    if (existingEntry) {
      // Mark as deleted by removing from index
      entries = removeFromIndex(entries, relativePath);
      return { entries };
    }
    return { entries, error: `fatal: pathspec '${pathSpec}' did not match any files` };
  }

  const stat = fs.lstatSync(fullPath);

  if (stat.isDirectory()) {
    // Add all files in directory recursively
    return addDirectory(repoRoot, entries, fullPath);
  } else if (stat.isSymbolicLink()) {
    // Add symlink
    const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));
    const sha = createBlobFromSymlink(repoRoot, fullPath);
    const entry = createIndexEntryFromFile(relativePath, sha, 0o120000, stat);
    entries = addToIndex(entries, entry);
    return { entries };
  } else {
    // Add regular file
    const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));
    const sha = createBlobFromFile(repoRoot, fullPath);
    const mode = getFileModeFromStat(stat);
    const entry = createIndexEntryFromFile(relativePath, sha, mode, stat);
    entries = addToIndex(entries, entry);
    return { entries };
  }
}

function addDirectory(
  repoRoot: string,
  entries: ReturnType<typeof readIndex>,
  dirPath: string
): { entries: ReturnType<typeof readIndex>; error?: string } {
  const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const result = addDirectory(repoRoot, entries, fullPath);
      if (result.error) return result;
      entries = result.entries;
    } else if (entry.isSymbolicLink()) {
      const stat = fs.lstatSync(fullPath);
      const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));
      const sha = createBlobFromSymlink(repoRoot, fullPath);
      const indexEntry = createIndexEntryFromFile(relativePath, sha, 0o120000, stat);
      entries = addToIndex(entries, indexEntry);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      const relativePath = normalizePathSeparator(path.relative(repoRoot, fullPath));
      const sha = createBlobFromFile(repoRoot, fullPath);
      const mode = getFileModeFromStat(stat);
      const indexEntry = createIndexEntryFromFile(relativePath, sha, mode, stat);
      entries = addToIndex(entries, indexEntry);
    }
  }

  return { entries };
}

function addAllChanges(repoRoot: string, entries: ReturnType<typeof readIndex>): ReturnType<typeof readIndex> {
  // Get all tracked files from index
  const trackedPaths = new Set(entries.map((e) => e.name));

  // Remove deleted files from index
  entries = entries.filter((e) => {
    const fullPath = path.join(repoRoot, e.name);
    return fs.existsSync(fullPath);
  });

  // Add/update all files in working directory
  const result = addDirectory(repoRoot, entries, repoRoot);
  return result.entries;
}

function updateTrackedFiles(repoRoot: string, entries: ReturnType<typeof readIndex>): ReturnType<typeof readIndex> {
  const newEntries: typeof entries = [];

  for (const entry of entries) {
    const fullPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(fullPath)) {
      // File deleted - don't include in new entries
      continue;
    }

    const stat = fs.lstatSync(fullPath);

    if (stat.isSymbolicLink()) {
      const sha = createBlobFromSymlink(repoRoot, fullPath);
      const newEntry = createIndexEntryFromFile(entry.name, sha, 0o120000, stat);
      newEntries.push(newEntry);
    } else {
      const sha = createBlobFromFile(repoRoot, fullPath);
      const mode = getFileModeFromStat(stat);
      const newEntry = createIndexEntryFromFile(entry.name, sha, mode, stat);
      newEntries.push(newEntry);
    }
  }

  return newEntries;
}
