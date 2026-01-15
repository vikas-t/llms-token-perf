// branch command - List, create, or delete branches

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, isValidBranchName, shortSha } from '../utils';
import {
  getBranches,
  getCurrentBranch,
  getHeadCommit,
  branchExists,
  updateBranch,
  deleteBranch,
  resolveRevision,
  resolveRef,
} from '../refs';
import { readObject, parseCommitContent, objectExists } from '../objects';

export function branch(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let deleteFlag = false;
  let forceDelete = false;
  let rename = false;
  let verbose = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === '-d') {
      deleteFlag = true;
    } else if (arg === '-D') {
      forceDelete = true;
      deleteFlag = true;
    } else if (arg === '-m') {
      rename = true;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (deleteFlag) {
    // Delete branch
    if (positional.length === 0) {
      console.error('fatal: branch name required');
      return 1;
    }

    const branchName = positional[0];
    return deleteBranchCmd(repoRoot, branchName, forceDelete);
  }

  if (rename) {
    // Rename branch
    if (positional.length < 2) {
      console.error('fatal: need old and new branch names');
      return 1;
    }

    const oldName = positional[0];
    const newName = positional[1];
    return renameBranch(repoRoot, oldName, newName);
  }

  if (positional.length === 0) {
    // List branches
    return listBranches(repoRoot, verbose);
  }

  // Create branch
  const branchName = positional[0];
  const startPoint = positional[1];
  return createBranch(repoRoot, branchName, startPoint);
}

function listBranches(repoRoot: string, verbose: boolean): number {
  const branches = getBranches(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  for (const branch of branches) {
    const isCurrent = branch === currentBranch;
    const prefix = isCurrent ? '* ' : '  ';

    if (verbose) {
      const sha = resolveRef(repoRoot, branch);
      if (sha) {
        let message = '';
        try {
          const { content } = readObject(repoRoot, sha);
          const info = parseCommitContent(content);
          message = info.message.split('\n')[0];
        } catch {
          // Ignore
        }
        console.log(`${prefix}${branch} ${shortSha(sha)} ${message}`);
      } else {
        console.log(`${prefix}${branch}`);
      }
    } else {
      console.log(`${prefix}${branch}`);
    }
  }

  return 0;
}

function createBranch(repoRoot: string, branchName: string, startPoint?: string): number {
  // Validate branch name
  if (!isValidBranchName(branchName)) {
    console.error(`fatal: '${branchName}' is not a valid branch name`);
    return 1;
  }

  // Check if already exists
  if (branchExists(repoRoot, branchName)) {
    console.error(`fatal: branch '${branchName}' already exists`);
    return 1;
  }

  // Get starting commit
  let sha: string | null;
  if (startPoint) {
    sha = resolveRevision(repoRoot, startPoint);
    if (!sha) {
      console.error(`fatal: not a valid object name: '${startPoint}'`);
      return 1;
    }
  } else {
    sha = getHeadCommit(repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      return 1;
    }
  }

  updateBranch(repoRoot, branchName, sha);
  return 0;
}

function deleteBranchCmd(repoRoot: string, branchName: string, force: boolean): number {
  // Check if branch exists
  if (!branchExists(repoRoot, branchName)) {
    console.error(`error: branch '${branchName}' not found`);
    return 1;
  }

  // Check if trying to delete current branch
  const currentBranch = getCurrentBranch(repoRoot);
  if (branchName === currentBranch) {
    console.error(`error: Cannot delete branch '${branchName}' checked out`);
    return 1;
  }

  // If not force, check if branch is merged
  if (!force) {
    const branchSha = resolveRef(repoRoot, branchName);
    const headSha = getHeadCommit(repoRoot);

    if (branchSha && headSha && !isAncestor(repoRoot, branchSha, headSha)) {
      console.error(`error: branch '${branchName}' is not fully merged`);
      console.error(`If you are sure you want to delete it, run 'minigit branch -D ${branchName}'`);
      return 1;
    }
  }

  deleteBranch(repoRoot, branchName);
  console.log(`Deleted branch ${branchName}`);
  return 0;
}

function renameBranch(repoRoot: string, oldName: string, newName: string): number {
  // Validate new name
  if (!isValidBranchName(newName)) {
    console.error(`fatal: '${newName}' is not a valid branch name`);
    return 1;
  }

  // Check if old branch exists
  if (!branchExists(repoRoot, oldName)) {
    console.error(`error: branch '${oldName}' not found`);
    return 1;
  }

  // Check if new name already exists
  if (branchExists(repoRoot, newName)) {
    console.error(`fatal: branch '${newName}' already exists`);
    return 1;
  }

  // Get the SHA of the old branch
  const sha = resolveRef(repoRoot, oldName);
  if (!sha) {
    console.error(`error: branch '${oldName}' not found`);
    return 1;
  }

  // Create new branch
  updateBranch(repoRoot, newName, sha);

  // Delete old branch
  deleteBranch(repoRoot, oldName);

  // Update HEAD if it was pointing to old branch
  const currentBranch = getCurrentBranch(repoRoot);
  if (currentBranch === oldName) {
    const headPath = path.join(repoRoot, '.minigit', 'HEAD');
    fs.writeFileSync(headPath, `ref: refs/heads/${newName}\n`);
  }

  return 0;
}

function isAncestor(repoRoot: string, commit: string, descendant: string): boolean {
  // BFS to check if commit is an ancestor of descendant
  const visited = new Set<string>();
  const queue = [descendant];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === commit) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (!objectExists(repoRoot, current)) {
      continue;
    }

    try {
      const { type, content } = readObject(repoRoot, current);
      if (type !== 'commit') continue;

      const info = parseCommitContent(content);
      queue.push(...info.parents);
    } catch {
      // Ignore errors
    }
  }

  return false;
}
