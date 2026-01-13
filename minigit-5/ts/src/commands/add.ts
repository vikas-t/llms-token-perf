// add command - Stage files for commit

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePath, getFileMode } from '../utils';
import { createBlob } from '../objects';
import { readIndex, writeIndex, getAllIndexEntries } from '../index-file';
import { getHeadCommit, resolveRevision } from '../refs';
import { walkTree, getTreeFromTreeIsh } from '../objects';
import { IndexEntry } from '../types';

export function add(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse flags
  let updateOnly = false;
  let addAll = false;
  const paths: string[] = [];

  for (const arg of args) {
    if (arg === '-u' || arg === '--update') {
      updateOnly = true;
    } else if (arg === '-A' || arg === '--all') {
      addAll = true;
    } else {
      paths.push(arg);
    }
  }

  // If no paths and no flags, error
  if (paths.length === 0 && !addAll && !updateOnly) {
    console.error('Nothing specified, nothing added.');
    return 1;
  }

  // Get current tracked files from HEAD commit
  const trackedFiles = new Set<string>();
  const headSha = getHeadCommit(repoRoot);
  if (headSha) {
    try {
      const treeSha = getTreeFromTreeIsh(headSha, repoRoot);
      const treeFiles = walkTree(treeSha, '', repoRoot);
      treeFiles.forEach((_, filePath) => trackedFiles.add(filePath));
    } catch {
      // No tree yet
    }
  }

  // Also add files that are in the index
  const currentIndex = readIndex(repoRoot);
  for (const entry of currentIndex.entries) {
    trackedFiles.add(entry.path);
  }

  // Collect files to add
  const filesToAdd: string[] = [];
  const filesToRemove: string[] = [];

  if (addAll || updateOnly) {
    // -A: stage all changes (new, modified, deleted)
    // -u: stage only tracked files (modified, deleted)

    // Find all files in working tree
    const workingTreeFiles = collectAllFiles(repoRoot, repoRoot);

    if (addAll) {
      // Add all working tree files
      filesToAdd.push(...workingTreeFiles);

      // Mark deleted tracked files for removal
      for (const trackedFile of trackedFiles) {
        const fullPath = path.join(repoRoot, trackedFile);
        if (!fs.existsSync(fullPath)) {
          filesToRemove.push(trackedFile);
        }
      }
    } else {
      // Update only - only tracked files
      for (const file of workingTreeFiles) {
        if (trackedFiles.has(file)) {
          filesToAdd.push(file);
        }
      }

      // Mark deleted tracked files for removal
      for (const trackedFile of trackedFiles) {
        const fullPath = path.join(repoRoot, trackedFile);
        if (!fs.existsSync(fullPath)) {
          filesToRemove.push(trackedFile);
        }
      }
    }
  } else {
    // Add specific paths
    for (const p of paths) {
      const resolvedPath = path.resolve(process.cwd(), p);

      if (!fs.existsSync(resolvedPath)) {
        // Check if it's a tracked file that was deleted
        const relativePath = normalizePath(path.relative(repoRoot, resolvedPath));
        if (trackedFiles.has(relativePath)) {
          filesToRemove.push(relativePath);
          continue;
        }
        console.error(`fatal: pathspec '${p}' did not match any files`);
        return 1;
      }

      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        // Add all files in directory
        const dirFiles = collectAllFiles(resolvedPath, repoRoot);
        filesToAdd.push(...dirFiles);
      } else {
        const relativePath = normalizePath(path.relative(repoRoot, resolvedPath));
        filesToAdd.push(relativePath);
      }
    }
  }

  // Read current index
  const index = readIndex(repoRoot);

  // Remove deleted files from index
  for (const filePath of filesToRemove) {
    const idx = index.entries.findIndex(e => e.path === filePath);
    if (idx >= 0) {
      index.entries.splice(idx, 1);
    }
  }

  // Add/update files in index
  for (const filePath of filesToAdd) {
    const fullPath = path.join(repoRoot, filePath);

    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const stats = fs.lstatSync(fullPath);

    // Skip directories
    if (stats.isDirectory()) {
      continue;
    }

    // Read file content
    let content: Buffer;
    let mode: number;

    if (stats.isSymbolicLink()) {
      // For symlinks, store the link target as content
      const target = fs.readlinkSync(fullPath);
      content = Buffer.from(target);
      mode = 0o120000;
    } else {
      content = fs.readFileSync(fullPath);
      mode = getFileMode(fullPath);
    }

    // Create blob object
    const sha = createBlob(content, true, repoRoot);

    // Update or add index entry
    const existingIdx = index.entries.findIndex(e => e.path === filePath);
    const entry: IndexEntry = {
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
      flags: Math.min(filePath.length, 0xfff),
      path: filePath,
    };

    if (existingIdx >= 0) {
      index.entries[existingIdx] = entry;
    } else {
      index.entries.push(entry);
    }
  }

  // Write updated index
  writeIndex(index, repoRoot);

  return 0;
}

function collectAllFiles(dir: string, repoRoot: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip .minigit directory
    if (entry.name === '.minigit') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...collectAllFiles(fullPath, repoRoot));
    } else {
      const relativePath = normalizePath(path.relative(repoRoot, fullPath));
      result.push(relativePath);
    }
  }

  return result;
}
