// branch command - List, create, or delete branches

import { findRepoRoot } from '../utils';
import { listBranches, createBranch, deleteBranch, renameBranch, getCurrentBranch, getHeadCommit, resolveRef, resolveRevision } from '../refs';
import { getCommit } from '../objects';

export function branch(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let deleteMode = false;
  let forceDelete = false;
  let renameMode = false;
  let verbose = false;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d') {
      deleteMode = true;
    } else if (arg === '-D') {
      deleteMode = true;
      forceDelete = true;
    } else if (arg === '-m') {
      renameMode = true;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // Handle delete mode
  if (deleteMode) {
    if (positionalArgs.length === 0) {
      console.error('fatal: branch name required');
      return 1;
    }

    const branchName = positionalArgs[0];
    const currentBranch = getCurrentBranch(repoRoot);

    if (branchName === currentBranch) {
      console.error(`error: Cannot delete branch '${branchName}' checked out`);
      return 1;
    }

    // Check if branch exists
    const branchSha = resolveRef(`refs/heads/${branchName}`, repoRoot);
    if (!branchSha) {
      console.error(`error: branch '${branchName}' not found.`);
      return 1;
    }

    // For -d (not -D), check if branch is merged into HEAD
    if (!forceDelete) {
      const headSha = getHeadCommit(repoRoot);
      if (headSha && !isAncestor(branchSha, headSha, repoRoot)) {
        console.error(`error: The branch '${branchName}' is not fully merged.`);
        console.error(`If you are sure you want to delete it, run 'minigit branch -D ${branchName}'.`);
        return 1;
      }
    }

    try {
      deleteBranch(branchName, repoRoot);
      console.log(`Deleted branch ${branchName} (was ${branchSha.slice(0, 7)}).`);
      return 0;
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      return 1;
    }
  }

  // Handle rename mode
  if (renameMode) {
    if (positionalArgs.length < 2) {
      console.error('fatal: branch rename requires old and new names');
      return 1;
    }

    const oldName = positionalArgs[0];
    const newName = positionalArgs[1];

    try {
      renameBranch(oldName, newName, repoRoot);
      console.log(`Branch '${oldName}' renamed to '${newName}'.`);
      return 0;
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      return 1;
    }
  }

  // Handle create mode
  if (positionalArgs.length > 0) {
    const branchName = positionalArgs[0];

    // Validate branch name
    if (branchName.startsWith('-') || branchName.includes(' ') || branchName.startsWith('.') || branchName.includes('..')) {
      console.error(`fatal: '${branchName}' is not a valid branch name.`);
      return 1;
    }

    let startPoint: string;
    if (positionalArgs.length > 1) {
      try {
        startPoint = resolveRevision(positionalArgs[1], repoRoot);
      } catch (e: any) {
        console.error(`fatal: ${e.message}`);
        return 1;
      }
    } else {
      const headSha = getHeadCommit(repoRoot);
      if (!headSha) {
        console.error('fatal: Not a valid object name: HEAD');
        return 1;
      }
      startPoint = headSha;
    }

    try {
      createBranch(branchName, startPoint, repoRoot);
      return 0;
    } catch (e: any) {
      console.error(`fatal: ${e.message}`);
      return 1;
    }
  }

  // List mode
  const branches = listBranches(repoRoot);
  const currentBranch = getCurrentBranch(repoRoot);

  branches.sort();

  for (const branch of branches) {
    const isCurrent = branch === currentBranch;
    const prefix = isCurrent ? '* ' : '  ';

    if (verbose) {
      const sha = resolveRef(`refs/heads/${branch}`, repoRoot);
      if (sha) {
        try {
          const commit = getCommit(sha, repoRoot);
          const shortSha = sha.slice(0, 7);
          const firstLine = commit.message.split('\n')[0];
          console.log(`${prefix}${branch} ${shortSha} ${firstLine}`);
        } catch {
          console.log(`${prefix}${branch}`);
        }
      } else {
        console.log(`${prefix}${branch}`);
      }
    } else {
      console.log(`${prefix}${branch}`);
    }
  }

  return 0;
}

function isAncestor(ancestor: string, descendant: string, repoRoot: string): boolean {
  // BFS from descendant to find ancestor
  const visited = new Set<string>();
  const queue = [descendant];

  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (visited.has(sha)) continue;
    visited.add(sha);

    if (sha === ancestor) {
      return true;
    }

    try {
      const commit = getCommit(sha, repoRoot);
      queue.push(...commit.parents);
    } catch {
      // Invalid commit
    }
  }

  return false;
}
