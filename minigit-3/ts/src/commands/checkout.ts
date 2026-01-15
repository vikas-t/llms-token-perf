// checkout command - Switch branches or restore files

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, ensureDir, normalizePath } from '../utils';
import { readIndex, writeIndex } from '../index-file';
import {
  resolveRef,
  branchExists,
  createBranch,
  setHead,
  setSymbolicRef,
  getHeadCommit,
  getCurrentBranch
} from '../refs';
import { readObject, parseCommit, parseTree } from '../objects';
import { IndexEntry } from '../types';

export function checkout(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let createBranchFlag = false;
  let force = false;
  const positionalArgs: string[] = [];
  let pathMode = false;
  const paths: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-b') {
      createBranchFlag = true;
    } else if (arg === '-f' || arg === '--force') {
      force = true;
    } else if (arg === '--') {
      pathMode = true;
    } else if (pathMode) {
      paths.push(arg);
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // Determine mode
  if (paths.length > 0 || pathMode) {
    // checkout [<commit>] -- <paths>
    const commitRef = positionalArgs.length > 0 ? positionalArgs[0] : null;
    checkoutPaths(commitRef, paths, repoRoot);
  } else if (createBranchFlag) {
    // checkout -b <new-branch> [<start-point>]
    if (positionalArgs.length === 0) {
      console.error('fatal: branch name required');
      process.exit(1);
    }
    const branchName = positionalArgs[0];
    const startPoint = positionalArgs.length > 1 ? positionalArgs[1] : null;
    createAndCheckoutBranch(branchName, startPoint, repoRoot);
  } else if (positionalArgs.length > 0) {
    const target = positionalArgs[0];

    // Check if it's a branch
    if (branchExists(target, repoRoot)) {
      checkoutBranch(target, force, repoRoot);
    } else {
      // Try as a commit SHA
      const sha = resolveRef(target, repoRoot);
      if (sha) {
        checkoutDetached(sha, force, repoRoot);
      } else {
        // Try as a file path
        const absPath = path.resolve(process.cwd(), target);
        const relPath = path.relative(repoRoot, absPath);
        if (fs.existsSync(absPath) || readIndex(repoRoot).some(e => e.name === normalizePath(relPath))) {
          checkoutPaths(null, [target], repoRoot);
        } else {
          console.error(`error: pathspec '${target}' did not match any file(s) known to git`);
          process.exit(1);
        }
      }
    }
  } else {
    console.error('fatal: you must specify a branch or a path');
    process.exit(1);
  }
}

function checkoutBranch(branchName: string, force: boolean, repoRoot: string): void {
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch === branchName) {
    console.log(`Already on '${branchName}'`);
    return;
  }

  const targetSha = resolveRef(branchName, repoRoot);
  if (!targetSha) {
    console.error(`error: branch '${branchName}' not found`);
    process.exit(1);
  }

  // Check for uncommitted changes that would be overwritten
  if (!force) {
    const conflicts = checkForConflicts(targetSha, repoRoot);
    if (conflicts.length > 0) {
      console.error('error: Your local changes to the following files would be overwritten by checkout:');
      for (const file of conflicts) {
        console.error(`\t${file}`);
      }
      console.error('Please commit your changes or stash them before you switch branches.');
      process.exit(1);
    }
  }

  // Update working tree
  updateWorkingTree(targetSha, repoRoot);

  // Update HEAD
  setSymbolicRef('HEAD', `refs/heads/${branchName}`, repoRoot);

  console.log(`Switched to branch '${branchName}'`);
}

function checkoutDetached(sha: string, force: boolean, repoRoot: string): void {
  // Check for uncommitted changes
  if (!force) {
    const conflicts = checkForConflicts(sha, repoRoot);
    if (conflicts.length > 0) {
      console.error('error: Your local changes to the following files would be overwritten by checkout:');
      for (const file of conflicts) {
        console.error(`\t${file}`);
      }
      process.exit(1);
    }
  }

  // Update working tree
  updateWorkingTree(sha, repoRoot);

  // Update HEAD to detached state
  setHead(sha, repoRoot);

  console.log(`Note: switching to '${sha.slice(0, 7)}'.`);
  console.log('');
  console.log('You are in \'detached HEAD\' state.');
}

function createAndCheckoutBranch(branchName: string, startPoint: string | null, repoRoot: string): void {
  if (branchExists(branchName, repoRoot)) {
    console.error(`fatal: a branch named '${branchName}' already exists`);
    process.exit(1);
  }

  let sha: string | null;
  if (startPoint) {
    sha = resolveRef(startPoint, repoRoot);
    if (!sha) {
      console.error(`fatal: not a valid object name: '${startPoint}'`);
      process.exit(1);
    }
  } else {
    sha = getHeadCommit(repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      process.exit(1);
    }
  }

  // If starting from a different commit, update working tree first
  const currentSha = getHeadCommit(repoRoot);
  if (currentSha !== sha) {
    updateWorkingTree(sha, repoRoot);
  }

  // Create branch
  createBranch(branchName, sha, repoRoot);

  // Update HEAD
  setSymbolicRef('HEAD', `refs/heads/${branchName}`, repoRoot);

  console.log(`Switched to a new branch '${branchName}'`);
}

function checkoutPaths(commitRef: string | null, paths: string[], repoRoot: string): void {
  let sourceFiles: Map<string, { sha: string; mode: number }>;

  if (commitRef) {
    const sha = resolveRef(commitRef, repoRoot);
    if (!sha) {
      console.error(`error: pathspec '${commitRef}' did not match any file(s) known to git`);
      process.exit(1);
    }

    const obj = readObject(sha, repoRoot);
    if (obj.type !== 'commit') {
      console.error(`error: '${commitRef}' is not a commit`);
      process.exit(1);
    }

    const commit = parseCommit(obj.content);
    sourceFiles = new Map();
    collectTreeFilesWithMode(commit.tree, '', repoRoot, sourceFiles);
  } else {
    // Restore from index
    const entries = readIndex(repoRoot);
    sourceFiles = new Map(entries.map(e => [e.name, { sha: e.sha, mode: e.mode }]));
  }

  for (const pathspec of paths) {
    const relPath = normalizePath(path.relative(repoRoot, path.resolve(process.cwd(), pathspec)));
    const entry = sourceFiles.get(relPath);

    if (entry) {
      // Restore single file
      restoreFile(relPath, entry.sha, entry.mode, repoRoot);
    } else {
      // Check if it's a directory prefix
      let found = false;
      for (const [name, e] of sourceFiles) {
        if (name.startsWith(relPath + '/') || name === relPath) {
          restoreFile(name, e.sha, e.mode, repoRoot);
          found = true;
        }
      }

      if (!found) {
        console.error(`error: pathspec '${pathspec}' did not match any file(s) known to git`);
        process.exit(1);
      }
    }
  }
}

function restoreFile(relPath: string, sha: string, mode: number, repoRoot: string): void {
  const absPath = path.join(repoRoot, relPath);
  ensureDir(path.dirname(absPath));

  const obj = readObject(sha, repoRoot);
  fs.writeFileSync(absPath, obj.content);

  // Set file mode
  if (mode === 0o100755) {
    fs.chmodSync(absPath, 0o755);
  }
}

function updateWorkingTree(targetSha: string, repoRoot: string): void {
  const currentSha = getHeadCommit(repoRoot);

  // Get current and target tree files
  const currentFiles = new Map<string, { sha: string; mode: number }>();
  const targetFiles = new Map<string, { sha: string; mode: number }>();

  if (currentSha) {
    const currentCommit = parseCommit(readObject(currentSha, repoRoot).content);
    collectTreeFilesWithMode(currentCommit.tree, '', repoRoot, currentFiles);
  }

  const targetCommit = parseCommit(readObject(targetSha, repoRoot).content);
  collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);

  // Remove files not in target
  for (const [name] of currentFiles) {
    if (!targetFiles.has(name)) {
      const absPath = path.join(repoRoot, name);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        // Try to remove empty parent directories
        removeEmptyDirs(path.dirname(absPath), repoRoot);
      }
    }
  }

  // Add/update files in target
  for (const [name, entry] of targetFiles) {
    const absPath = path.join(repoRoot, name);
    ensureDir(path.dirname(absPath));

    const obj = readObject(entry.sha, repoRoot);
    fs.writeFileSync(absPath, obj.content);

    if (entry.mode === 0o100755) {
      fs.chmodSync(absPath, 0o755);
    }
  }

  // Update index to match target
  const newEntries: IndexEntry[] = [];
  for (const [name, entry] of targetFiles) {
    const absPath = path.join(repoRoot, name);
    const stats = fs.statSync(absPath);

    newEntries.push({
      ctimeSec: Math.floor(stats.ctimeMs / 1000),
      ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
      mtimeSec: Math.floor(stats.mtimeMs / 1000),
      mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
      dev: stats.dev,
      ino: stats.ino,
      mode: entry.mode,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      sha: entry.sha,
      flags: Math.min(name.length, 0xfff),
      name
    });
  }

  writeIndex(newEntries, repoRoot);
}

function checkForConflicts(targetSha: string, repoRoot: string): string[] {
  const indexEntries = readIndex(repoRoot);
  const conflicts: string[] = [];

  const targetCommit = parseCommit(readObject(targetSha, repoRoot).content);
  const targetFiles = new Map<string, { sha: string; mode: number }>();
  collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);

  for (const entry of indexEntries) {
    const absPath = path.join(repoRoot, entry.name);
    const targetEntry = targetFiles.get(entry.name);

    if (!fs.existsSync(absPath)) continue;

    // Check if working tree differs from index
    const stats = fs.statSync(absPath);
    if (stats.isFile()) {
      const content = fs.readFileSync(absPath);
      const { sha1 } = require('../utils');
      const header = `blob ${content.length}\0`;
      const fullContent = Buffer.concat([Buffer.from(header), content]);
      const workSha = sha1(fullContent);

      if (workSha !== entry.sha) {
        // Working tree modified
        if (targetEntry && targetEntry.sha !== entry.sha) {
          // Target also differs - conflict
          conflicts.push(entry.name);
        }
      }
    }
  }

  return conflicts;
}

function collectTreeFilesWithMode(treeSha: string, prefix: string, repoRoot: string, files: Map<string, { sha: string; mode: number }>): void {
  const treeObj = readObject(treeSha, repoRoot);
  const entries = parseTree(treeObj.content);

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'tree') {
      collectTreeFilesWithMode(entry.sha, name, repoRoot, files);
    } else {
      files.set(name, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
    }
  }
}

function removeEmptyDirs(dir: string, repoRoot: string): void {
  while (dir !== repoRoot && dir.startsWith(repoRoot)) {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}
