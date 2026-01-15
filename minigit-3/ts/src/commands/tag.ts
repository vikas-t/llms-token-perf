// tag command - Manage tags

import { findRepoRoot, getAuthorInfo, formatAuthor } from '../utils';
import {
  listTags,
  tagExists,
  createTag,
  deleteTag,
  resolveRef,
  readRef
} from '../refs';
import { writeTag, readObject, parseTag as parseTagObject } from '../objects';
import { TagObject } from '../types';

export function tag(args: string[]): void {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a git repository');
    process.exit(1);
  }

  let deleteMode = false;
  let annotated = false;
  let message = '';
  let listMode = false;
  const positionalArgs: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d') {
      deleteMode = true;
    } else if (arg === '-a') {
      annotated = true;
    } else if (arg === '-m' && i + 1 < args.length) {
      annotated = true;
      message = args[++i];
    } else if (arg === '-l' || arg === '--list') {
      listMode = true;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  if (deleteMode) {
    if (positionalArgs.length === 0) {
      console.error('fatal: tag name required');
      process.exit(1);
    }
    deleteTagCmd(positionalArgs[0], repoRoot);
  } else if (listMode || positionalArgs.length === 0) {
    listTagsCmd(repoRoot);
  } else {
    const tagName = positionalArgs[0];
    const target = positionalArgs.length > 1 ? positionalArgs[1] : 'HEAD';
    createTagCmd(tagName, target, annotated, message, repoRoot);
  }
}

function listTagsCmd(repoRoot: string): void {
  const tags = listTags(repoRoot);
  for (const tagName of tags) {
    console.log(tagName);
  }
}

function createTagCmd(name: string, target: string, annotated: boolean, message: string, repoRoot: string): void {
  if (tagExists(name, repoRoot)) {
    console.error(`fatal: tag '${name}' already exists`);
    process.exit(1);
  }

  const sha = resolveRef(target, repoRoot);
  if (!sha) {
    console.error(`fatal: not a valid object name: '${target}'`);
    process.exit(1);
  }

  if (annotated) {
    // Create annotated tag object
    const tagger = getAuthorInfo();
    const tagObj: TagObject = {
      object: sha,
      type: 'commit',
      tag: name,
      tagger: formatAuthor(tagger.name, tagger.email, tagger.date),
      message: message || ''
    };

    const tagSha = writeTag(tagObj, repoRoot);
    createTag(name, tagSha, repoRoot);
  } else {
    // Create lightweight tag
    createTag(name, sha, repoRoot);
  }
}

function deleteTagCmd(name: string, repoRoot: string): void {
  if (!tagExists(name, repoRoot)) {
    console.error(`error: tag '${name}' not found`);
    process.exit(1);
  }

  deleteTag(name, repoRoot);
  console.log(`Deleted tag '${name}'`);
}
