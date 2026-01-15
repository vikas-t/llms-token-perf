// tag command - Create, list, or delete tags

import { findRepoRoot, getAuthorInfo } from '../utils';
import { getTags, createTag, deleteTag, tagExists, getHeadCommit, resolveRevision } from '../refs';
import { createTagContent, writeObject, readObject, parseTagContent } from '../objects';
import { TagInfo } from '../types';

export function tag(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let annotated = false;
  let deleteFlag = false;
  let listFlag = false;
  let message: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-a') {
      annotated = true;
    } else if (args[i] === '-d') {
      deleteFlag = true;
    } else if (args[i] === '-l') {
      listFlag = true;
    } else if (args[i] === '-m' && i + 1 < args.length) {
      message = args[++i];
      annotated = true; // -m implies -a
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }

  if (deleteFlag) {
    if (positional.length === 0) {
      console.error('fatal: tag name required');
      return 1;
    }
    return deleteTagCmd(repoRoot, positional[0]);
  }

  if (listFlag || positional.length === 0) {
    return listTags(repoRoot);
  }

  // Create tag
  const tagName = positional[0];
  const commitRef = positional[1];

  if (annotated) {
    if (!message) {
      console.error('fatal: -a requires -m <message>');
      return 1;
    }
    return createAnnotatedTag(repoRoot, tagName, commitRef, message);
  }

  return createLightweightTag(repoRoot, tagName, commitRef);
}

function listTags(repoRoot: string): number {
  const tags = getTags(repoRoot);

  for (const t of tags) {
    console.log(t);
  }

  return 0;
}

function createLightweightTag(repoRoot: string, tagName: string, commitRef?: string): number {
  if (tagExists(repoRoot, tagName)) {
    console.error(`fatal: tag '${tagName}' already exists`);
    return 1;
  }

  let sha: string | null;
  if (commitRef) {
    sha = resolveRevision(repoRoot, commitRef);
    if (!sha) {
      console.error(`fatal: not a valid object name: '${commitRef}'`);
      return 1;
    }
  } else {
    sha = getHeadCommit(repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      return 1;
    }
  }

  createTag(repoRoot, tagName, sha);
  return 0;
}

function createAnnotatedTag(repoRoot: string, tagName: string, commitRef: string | undefined, message: string): number {
  if (tagExists(repoRoot, tagName)) {
    console.error(`fatal: tag '${tagName}' already exists`);
    return 1;
  }

  let sha: string | null;
  if (commitRef) {
    sha = resolveRevision(repoRoot, commitRef);
    if (!sha) {
      console.error(`fatal: not a valid object name: '${commitRef}'`);
      return 1;
    }
  } else {
    sha = getHeadCommit(repoRoot);
    if (!sha) {
      console.error('fatal: not a valid object name: HEAD');
      return 1;
    }
  }

  const tagger = getAuthorInfo();

  const tagInfo: TagInfo = {
    object: sha,
    type: 'commit',
    tag: tagName,
    tagger: tagger.name,
    taggerEmail: tagger.email,
    taggerTimestamp: tagger.timestamp,
    taggerTz: tagger.tz,
    message,
  };

  const tagContent = createTagContent(tagInfo);
  const tagSha = writeObject(repoRoot, tagContent);

  createTag(repoRoot, tagName, tagSha);
  return 0;
}

function deleteTagCmd(repoRoot: string, tagName: string): number {
  if (!tagExists(repoRoot, tagName)) {
    console.error(`error: tag '${tagName}' not found`);
    return 1;
  }

  deleteTag(repoRoot, tagName);
  console.log(`Deleted tag '${tagName}'`);
  return 0;
}
