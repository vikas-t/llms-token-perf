// tag command - Create, list, or delete tags

import { findRepoRoot, formatAuthorDate, getAuthorInfo } from '../utils';
import { listTags, createTag as createTagRef, deleteTag as deleteTagRef, resolveRef, getHeadCommit, resolveRevision } from '../refs';
import { createTag as createTagObject, getObjectType, getTagObject, readObject, parseTag } from '../objects';

export function tag(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  // Parse arguments
  let annotated = false;
  let deleteMode = false;
  let listMode = false;
  let message: string | null = null;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-a') {
      annotated = true;
    } else if (arg === '-d') {
      deleteMode = true;
    } else if (arg === '-l') {
      listMode = true;
    } else if (arg === '-m' && i + 1 < args.length) {
      message = args[i + 1];
      annotated = true;
      i++;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // Delete mode
  if (deleteMode) {
    if (positionalArgs.length === 0) {
      console.error('fatal: tag name required');
      return 1;
    }

    for (const tagName of positionalArgs) {
      try {
        deleteTagRef(tagName, repoRoot);
        console.log(`Deleted tag '${tagName}'`);
      } catch (e: any) {
        console.error(`error: tag '${tagName}' not found.`);
        return 1;
      }
    }
    return 0;
  }

  // List mode (default if no positional args)
  if (listMode || positionalArgs.length === 0) {
    const tags = listTags(repoRoot);
    tags.sort();
    for (const t of tags) {
      console.log(t);
    }
    return 0;
  }

  // Create mode
  const tagName = positionalArgs[0];
  let targetSha: string;

  if (positionalArgs.length > 1) {
    try {
      targetSha = resolveRevision(positionalArgs[1], repoRoot);
    } catch (e: any) {
      console.error(`fatal: ${e.message}`);
      return 1;
    }
  } else {
    const headSha = getHeadCommit(repoRoot);
    if (!headSha) {
      console.error('fatal: Failed to resolve HEAD');
      return 1;
    }
    targetSha = headSha;
  }

  // Check if tag already exists
  if (resolveRef(`refs/tags/${tagName}`, repoRoot)) {
    console.error(`fatal: tag '${tagName}' already exists`);
    return 1;
  }

  if (annotated) {
    // Create annotated tag object
    if (!message) {
      message = '';
    }

    const authorInfo = getAuthorInfo();
    const tagger = formatAuthorDate(authorInfo.name, authorInfo.email, authorInfo.date, authorInfo.tz);
    const objectType = getObjectType(targetSha, repoRoot);

    const tagSha = createTagObject(targetSha, objectType, tagName, tagger, message, repoRoot);
    createTagRef(tagName, tagSha, repoRoot);
  } else {
    // Lightweight tag - just a ref
    createTagRef(tagName, targetSha, repoRoot);
  }

  return 0;
}
