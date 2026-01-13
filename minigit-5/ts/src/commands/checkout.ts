// checkout command - Switch branches or restore files

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePath, ensureDir } from '../utils';
import { readIndex, writeIndex } from '../index-file';
import { getHeadCommit, getCurrentBranch, resolveRef, resolveRevision, setHead, createBranch } from '../refs';
import { walkTree, getTreeFromTreeIsh, getBlob, hashObject, getCommit } from '../objects';
import { IndexEntry } from '../types';

export function checkout(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let createBranchFlag = false;
  let startPoint: string | null = null;
  const positionalArgs: string[] = [];
  let afterDashDash = false;
  const pathsAfterDash: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      afterDashDash = true;
    } else if (afterDashDash) {
      pathsAfterDash.push(arg);
    } else if (arg === '-b') {
      createBranchFlag = true;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // Handle file restore: checkout [<commit>] -- <file>
  if (pathsAfterDash.length > 0) {
    let commitSha: string | null = null;

    // If there's a positional arg before --, it's the commit
    if (positionalArgs.length > 0) {
      try {
        commitSha = resolveRevision(positionalArgs[0], repoRoot);
      } catch (e: any) {
        console.error(`fatal: ${e.message}`);
        return 1;
      }
    }

    return restoreFiles(pathsAfterDash, commitSha, repoRoot);
  }

  // Handle checkout -b <new-branch> [<start-point>]
  if (createBranchFlag) {
    if (positionalArgs.length === 0) {
      console.error('fatal: branch name required');
      return 1;
    }

    const newBranch = positionalArgs[0];
    let startSha: string;

    if (positionalArgs.length > 1) {
      try {
        startSha = resolveRevision(positionalArgs[1], repoRoot);
      } catch (e: any) {
        console.error(`fatal: ${e.message}`);
        return 1;
      }
    } else {
      const headSha = getHeadCommit(repoRoot);
      if (!headSha) {
        console.error('fatal: not a valid object name: HEAD');
        return 1;
      }
      startSha = headSha;
    }

    // Check if branch already exists
    if (resolveRef(`refs/heads/${newBranch}`, repoRoot)) {
      console.error(`fatal: A branch named '${newBranch}' already exists.`);
      return 1;
    }

    // Create branch
    createBranch(newBranch, startSha, repoRoot);

    // Update working tree if switching from different commit
    const currentHeadSha = getHeadCommit(repoRoot);
    if (currentHeadSha !== startSha) {
      const result = updateWorkingTree(startSha, repoRoot);
      if (result !== 0) return result;
    }

    // Update HEAD
    setHead(`ref: refs/heads/${newBranch}`, repoRoot);

    console.log(`Switched to a new branch '${newBranch}'`);
    return 0;
  }

  // Handle checkout <branch|commit>
  if (positionalArgs.length === 0) {
    console.error('fatal: you must specify a branch or commit');
    return 1;
  }

  const target = positionalArgs[0];

  // Check if target is a branch
  const branchSha = resolveRef(`refs/heads/${target}`, repoRoot);
  if (branchSha) {
    // Check for uncommitted changes that would be overwritten
    const conflict = checkForConflictingChanges(branchSha, repoRoot);
    if (conflict) {
      console.error(`error: Your local changes to the following files would be overwritten by checkout:`);
      console.error(`\t${conflict}`);
      console.error('Please commit your changes or stash them before you switch branches.');
      return 1;
    }

    // Update working tree
    const result = updateWorkingTree(branchSha, repoRoot);
    if (result !== 0) return result;

    // Update HEAD
    setHead(`ref: refs/heads/${target}`, repoRoot);

    console.log(`Switched to branch '${target}'`);
    return 0;
  }

  // Try as commit SHA for detached HEAD
  try {
    const sha = resolveRevision(target, repoRoot);

    // Check for conflicts
    const conflict = checkForConflictingChanges(sha, repoRoot);
    if (conflict) {
      console.error(`error: Your local changes to the following files would be overwritten by checkout:`);
      console.error(`\t${conflict}`);
      return 1;
    }

    // Update working tree
    const result = updateWorkingTree(sha, repoRoot);
    if (result !== 0) return result;

    // Detached HEAD
    setHead(sha, repoRoot);

    console.log(`Note: switching to '${target}'.`);
    console.log('');
    console.log("You are in 'detached HEAD' state.");
    console.log(`HEAD is now at ${sha.slice(0, 7)}`);
    return 0;
  } catch (e: any) {
    console.error(`error: pathspec '${target}' did not match any file(s) known to git`);
    return 1;
  }
}

function restoreFiles(paths: string[], commitSha: string | null, repoRoot: string): number {
  const index = readIndex(repoRoot);

  for (const filePath of paths) {
    let content: Buffer;
    let mode: number;

    if (commitSha) {
      // Restore from commit
      try {
        const treeSha = getTreeFromTreeIsh(commitSha, repoRoot);
        const treeFiles = walkTree(treeSha, '', repoRoot);
        const entry = treeFiles.get(filePath);

        if (!entry) {
          console.error(`error: pathspec '${filePath}' did not match any file(s)`);
          return 1;
        }

        content = getBlob(entry.sha, repoRoot);
        mode = parseInt(entry.mode, 8);
      } catch (e: any) {
        console.error(`error: ${e.message}`);
        return 1;
      }
    } else {
      // Restore from index
      const indexEntry = index.entries.find(e => e.path === filePath);
      if (!indexEntry) {
        console.error(`error: pathspec '${filePath}' did not match any file(s)`);
        return 1;
      }

      content = getBlob(indexEntry.sha, repoRoot);
      mode = indexEntry.mode;
    }

    // Write file
    const fullPath = path.join(repoRoot, filePath);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);

    // Set mode
    if ((mode & 0o777) === 0o755) {
      fs.chmodSync(fullPath, 0o755);
    }
  }

  return 0;
}

function checkForConflictingChanges(targetSha: string, repoRoot: string): string | null {
  const index = readIndex(repoRoot);
  const headSha = getHeadCommit(repoRoot);

  // Get files in target tree
  const targetTree = getTreeFromTreeIsh(targetSha, repoRoot);
  const targetFiles = walkTree(targetTree, '', repoRoot);

  // Get files in HEAD tree
  const headFiles = new Map<string, { sha: string; mode: string }>();
  if (headSha) {
    const headTree = getTreeFromTreeIsh(headSha, repoRoot);
    walkTree(headTree, '', repoRoot).forEach((v, k) => headFiles.set(k, v));
  }

  // Check for conflicting changes
  for (const [filePath, targetEntry] of targetFiles) {
    const headEntry = headFiles.get(filePath);
    const fullPath = path.join(repoRoot, filePath);

    // If file differs between HEAD and target
    if (!headEntry || headEntry.sha !== targetEntry.sha) {
      // Check if working tree has local changes
      if (fs.existsSync(fullPath)) {
        const stats = fs.lstatSync(fullPath);
        if (!stats.isDirectory()) {
          const content = stats.isSymbolicLink()
            ? Buffer.from(fs.readlinkSync(fullPath))
            : fs.readFileSync(fullPath);
          const workingSha = hashObject('blob', content);

          // File is modified in working tree
          const indexEntry = index.entries.find(e => e.path === filePath);
          const indexSha = indexEntry?.sha;

          // If working tree differs from both HEAD and index, conflict
          if (headEntry && workingSha !== headEntry.sha && workingSha !== indexSha) {
            return filePath;
          }
        }
      }
    }
  }

  return null;
}

function updateWorkingTree(targetSha: string, repoRoot: string): number {
  const targetTree = getTreeFromTreeIsh(targetSha, repoRoot);
  const targetFiles = walkTree(targetTree, '', repoRoot);

  // Get current HEAD files
  const headSha = getHeadCommit(repoRoot);
  const headFiles = new Map<string, { sha: string; mode: string }>();
  if (headSha) {
    const headTree = getTreeFromTreeIsh(headSha, repoRoot);
    walkTree(headTree, '', repoRoot).forEach((v, k) => headFiles.set(k, v));
  }

  // Remove files that are in HEAD but not in target
  for (const [filePath] of headFiles) {
    if (!targetFiles.has(filePath)) {
      const fullPath = path.join(repoRoot, filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        // Clean up empty directories
        cleanEmptyDirs(path.dirname(fullPath), repoRoot);
      }
    }
  }

  // Create/update files from target
  for (const [filePath, entry] of targetFiles) {
    const fullPath = path.join(repoRoot, filePath);
    ensureDir(path.dirname(fullPath));

    const content = getBlob(entry.sha, repoRoot);

    if (entry.mode === '120000') {
      // Symlink
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      fs.symlinkSync(content.toString(), fullPath);
    } else {
      fs.writeFileSync(fullPath, content);
      if (entry.mode === '100755') {
        fs.chmodSync(fullPath, 0o755);
      }
    }
  }

  // Update index to match target
  const index = readIndex(repoRoot);
  index.entries = [];

  for (const [filePath, entry] of targetFiles) {
    const fullPath = path.join(repoRoot, filePath);
    const stats = fs.lstatSync(fullPath);

    const indexEntry: IndexEntry = {
      ctimeSec: Math.floor(stats.ctimeMs / 1000),
      ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
      mtimeSec: Math.floor(stats.mtimeMs / 1000),
      mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
      dev: stats.dev,
      ino: stats.ino,
      mode: parseInt(entry.mode, 8),
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      sha: entry.sha,
      flags: Math.min(filePath.length, 0xfff),
      path: filePath,
    };

    index.entries.push(indexEntry);
  }

  writeIndex(index, repoRoot);

  return 0;
}

function cleanEmptyDirs(dir: string, repoRoot: string): void {
  if (dir === repoRoot || !dir.startsWith(repoRoot)) return;

  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) {
      fs.rmdirSync(dir);
      cleanEmptyDirs(path.dirname(dir), repoRoot);
    }
  } catch {
    // Directory doesn't exist or not empty
  }
}
