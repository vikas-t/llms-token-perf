// branch command - Manage branches

import { findRepoRoot, isValidBranchName, shortSha } from '../utils';
import {
  listBranches,
  branchExists,
  createBranch,
  deleteBranch,
  getCurrentBranch,
  resolveRef,
  readRef,
  writeRef,
  deleteRef,
  getCommitMessage
} from '../refs';
import { readObject, parseCommit } from '../objects';

export function branch(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let deleteMode = false;
  let forceDelete = false;
  let rename = false;
  let verbose = false;
  const positionalArgs: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d') {
      deleteMode = true;
    } else if (arg === '-D') {
      deleteMode = true;
      forceDelete = true;
    } else if (arg === '-m') {
      rename = true;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  if (deleteMode) {
    // Delete branch
    if (positionalArgs.length === 0) {
      console.error('fatal: branch name required');
      process.exit(1);
    }

    const branchName = positionalArgs[0];
    deleteBranchCmd(branchName, forceDelete, repoRoot);
  } else if (rename) {
    // Rename branch
    if (positionalArgs.length < 2) {
      console.error('fatal: need both old and new branch names');
      process.exit(1);
    }

    const oldName = positionalArgs[0];
    const newName = positionalArgs[1];
    renameBranch(oldName, newName, repoRoot);
  } else if (positionalArgs.length === 0) {
    // List branches
    listBranchesCmd(verbose, repoRoot);
  } else if (positionalArgs.length === 1) {
    // Create branch
    createBranchCmd(positionalArgs[0], null, repoRoot);
  } else {
    // Create branch at specific commit
    createBranchCmd(positionalArgs[0], positionalArgs[1], repoRoot);
  }
}

function listBranchesCmd(verbose: boolean, repoRoot: string): void {
  const branches = listBranches(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  for (const branchName of branches) {
    const isCurrent = branchName === currentBranch;
    const prefix = isCurrent ? '* ' : '  ';

    if (verbose) {
      const sha = readRef(`refs/heads/${branchName}`, repoRoot);
      if (sha) {
        try {
          const message = getCommitMessage(sha, repoRoot);
          console.log(`${prefix}${branchName} ${shortSha(sha)} ${message}`);
        } catch {
          console.log(`${prefix}${branchName} ${shortSha(sha)}`);
        }
      } else {
        console.log(`${prefix}${branchName}`);
      }
    } else {
      console.log(`${prefix}${branchName}`);
    }
  }
}

function createBranchCmd(name: string, startPoint: string | null, repoRoot: string): void {
  if (!isValidBranchName(name)) {
    console.error(`fatal: '${name}' is not a valid branch name`);
    process.exit(1);
  }

  if (branchExists(name, repoRoot)) {
    console.error(`fatal: a branch named '${name}' already exists`);
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
    sha = resolveRef('HEAD', repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      process.exit(1);
    }
  }

  createBranch(name, sha, repoRoot);
}

function deleteBranchCmd(name: string, force: boolean, repoRoot: string): void {
  const currentBranch = getCurrentBranch(repoRoot);

  if (name === currentBranch) {
    console.error(`error: Cannot delete branch '${name}' checked out`);
    process.exit(1);
  }

  if (!branchExists(name, repoRoot)) {
    console.error(`error: branch '${name}' not found`);
    process.exit(1);
  }

  // Check if branch is merged (unless force delete)
  if (!force) {
    const branchSha = readRef(`refs/heads/${name}`, repoRoot);
    const headSha = resolveRef('HEAD', repoRoot);

    if (branchSha && headSha && !isAncestor(branchSha, headSha, repoRoot)) {
      console.error(`error: The branch '${name}' is not fully merged.`);
      console.error(`If you are sure you want to delete it, run 'git branch -D ${name}'.`);
      process.exit(1);
    }
  }

  const deleted = deleteBranch(name, repoRoot);
  if (deleted) {
    console.log(`Deleted branch ${name}`);
  }
}

function renameBranch(oldName: string, newName: string, repoRoot: string): void {
  if (!isValidBranchName(newName)) {
    console.error(`fatal: '${newName}' is not a valid branch name`);
    process.exit(1);
  }

  if (!branchExists(oldName, repoRoot)) {
    console.error(`error: branch '${oldName}' not found`);
    process.exit(1);
  }

  if (branchExists(newName, repoRoot)) {
    console.error(`fatal: a branch named '${newName}' already exists`);
    process.exit(1);
  }

  const sha = readRef(`refs/heads/${oldName}`, repoRoot);
  if (!sha) {
    console.error(`error: branch '${oldName}' not found`);
    process.exit(1);
  }

  // Create new branch
  writeRef(`refs/heads/${newName}`, sha, repoRoot);

  // Delete old branch
  deleteRef(`refs/heads/${oldName}`, repoRoot);

  // Update HEAD if current branch was renamed
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch === oldName) {
    const { setSymbolicRef } = require('../refs');
    setSymbolicRef('HEAD', `refs/heads/${newName}`, repoRoot);
  }
}

function isAncestor(commitSha: string, headSha: string, repoRoot: string): boolean {
  // Check if commitSha is an ancestor of headSha
  const visited = new Set<string>();
  const queue = [headSha];

  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (sha === commitSha) return true;
    if (visited.has(sha)) continue;
    visited.add(sha);

    try {
      const obj = readObject(sha, repoRoot);
      if (obj.type === 'commit') {
        const commit = parseCommit(obj.content);
        queue.push(...commit.parents);
      }
    } catch {
      // Ignore errors
    }
  }

  return false;
}
