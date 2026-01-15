// diff command - Show changes

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, normalizePathSeparator, isBinaryFile } from '../utils';
import { readIndex } from '../index-file';
import { readObject, parseCommitContent, parseTreeContent, createBlobContent, hashObject, objectExists } from '../objects';
import { getHeadCommit, resolveRevision } from '../refs';
import { formatUnifiedDiff, formatDiffStat } from '../diff-algo';
import { FileDiff } from '../types';

export function diff(args: string[]): number {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('fatal: not a minigit repository');
    return 1;
  }

  let cached = false;
  let showStat = false;
  const commits: string[] = [];
  const paths: string[] = [];
  let inPathSpec = false;

  for (const arg of args) {
    if (arg === '--') {
      inPathSpec = true;
    } else if (inPathSpec) {
      paths.push(arg);
    } else if (arg === '--cached' || arg === '--staged') {
      cached = true;
    } else if (arg === '--stat') {
      showStat = true;
    } else if (!arg.startsWith('-')) {
      commits.push(arg);
    }
  }

  let output: string;

  if (commits.length === 2) {
    // Diff between two commits
    output = diffBetweenCommits(repoRoot, commits[0], commits[1], paths);
  } else if (commits.length === 1) {
    // Diff between commit and working tree
    output = diffCommitToWorkingTree(repoRoot, commits[0], paths);
  } else if (cached) {
    // Diff between HEAD and index (staged changes)
    output = diffHeadToIndex(repoRoot, paths);
  } else {
    // Diff between index and working tree (unstaged changes)
    output = diffIndexToWorkingTree(repoRoot, paths);
  }

  if (output) {
    console.log(output.trimEnd());
  }

  return 0;
}

function diffIndexToWorkingTree(repoRoot: string, filterPaths: string[]): string {
  const entries = readIndex(repoRoot);
  const diffs: string[] = [];

  for (const entry of entries) {
    if (filterPaths.length > 0 && !matchesPath(entry.name, filterPaths)) {
      continue;
    }

    const fullPath = path.join(repoRoot, entry.name);

    if (!fs.existsSync(fullPath)) {
      // File deleted
      const { content: oldContent } = readObject(repoRoot, entry.sha);
      if (isBinaryFile(oldContent)) {
        diffs.push(`Binary file ${entry.name} deleted`);
      } else {
        diffs.push(formatUnifiedDiff(entry.name, entry.name, oldContent.toString(), ''));
      }
      continue;
    }

    const stat = fs.lstatSync(fullPath);
    let workingContent: Buffer;

    if (stat.isSymbolicLink()) {
      workingContent = Buffer.from(fs.readlinkSync(fullPath));
    } else {
      workingContent = fs.readFileSync(fullPath);
    }

    const workingBlobContent = createBlobContent(workingContent);
    const workingSha = hashObject(workingBlobContent);

    if (workingSha !== entry.sha) {
      const { content: indexContent } = readObject(repoRoot, entry.sha);

      if (isBinaryFile(indexContent) || isBinaryFile(workingContent)) {
        diffs.push(`Binary files a/${entry.name} and b/${entry.name} differ`);
      } else {
        diffs.push(formatUnifiedDiff(entry.name, entry.name, indexContent.toString(), workingContent.toString()));
      }
    }
  }

  return diffs.join('');
}

function diffHeadToIndex(repoRoot: string, filterPaths: string[]): string {
  const entries = readIndex(repoRoot);
  const headCommit = getHeadCommit(repoRoot);

  // Get HEAD tree files
  const headFiles = new Map<string, string>();
  if (headCommit) {
    const { content } = readObject(repoRoot, headCommit);
    const commitInfo = parseCommitContent(content);
    collectTreeFiles(repoRoot, commitInfo.tree, '', headFiles);
  }

  const diffs: string[] = [];

  // Check index files
  for (const entry of entries) {
    if (filterPaths.length > 0 && !matchesPath(entry.name, filterPaths)) {
      continue;
    }

    const headSha = headFiles.get(entry.name);

    if (!headSha) {
      // New file
      const { content } = readObject(repoRoot, entry.sha);
      if (isBinaryFile(content)) {
        diffs.push(`Binary file ${entry.name} added`);
      } else {
        diffs.push(formatUnifiedDiff('/dev/null', entry.name, '', content.toString()));
      }
    } else if (headSha !== entry.sha) {
      // Modified
      const { content: headContent } = readObject(repoRoot, headSha);
      const { content: indexContent } = readObject(repoRoot, entry.sha);

      if (isBinaryFile(headContent) || isBinaryFile(indexContent)) {
        diffs.push(`Binary files a/${entry.name} and b/${entry.name} differ`);
      } else {
        diffs.push(formatUnifiedDiff(entry.name, entry.name, headContent.toString(), indexContent.toString()));
      }
    }

    headFiles.delete(entry.name);
  }

  // Check for deleted files (in HEAD but not in index)
  for (const [name, sha] of headFiles) {
    if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
      continue;
    }

    const { content } = readObject(repoRoot, sha);
    if (isBinaryFile(content)) {
      diffs.push(`Binary file ${name} deleted`);
    } else {
      diffs.push(formatUnifiedDiff(name, '/dev/null', content.toString(), ''));
    }
  }

  return diffs.join('');
}

function diffBetweenCommits(repoRoot: string, ref1: string, ref2: string, filterPaths: string[]): string {
  const sha1 = resolveRevision(repoRoot, ref1);
  const sha2 = resolveRevision(repoRoot, ref2);

  if (!sha1 || !sha2) {
    return '';
  }

  const files1 = new Map<string, string>();
  const files2 = new Map<string, string>();

  const { content: content1 } = readObject(repoRoot, sha1);
  const commitInfo1 = parseCommitContent(content1);
  collectTreeFiles(repoRoot, commitInfo1.tree, '', files1);

  const { content: content2 } = readObject(repoRoot, sha2);
  const commitInfo2 = parseCommitContent(content2);
  collectTreeFiles(repoRoot, commitInfo2.tree, '', files2);

  return diffFileMaps(repoRoot, files1, files2, filterPaths);
}

function diffCommitToWorkingTree(repoRoot: string, ref: string, filterPaths: string[]): string {
  const sha = resolveRevision(repoRoot, ref);
  if (!sha) {
    return '';
  }

  const commitFiles = new Map<string, string>();
  const { content } = readObject(repoRoot, sha);
  const commitInfo = parseCommitContent(content);
  collectTreeFiles(repoRoot, commitInfo.tree, '', commitFiles);

  const diffs: string[] = [];

  // Compare commit files to working tree
  for (const [name, fileSha] of commitFiles) {
    if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
      continue;
    }

    const fullPath = path.join(repoRoot, name);

    if (!fs.existsSync(fullPath)) {
      // Deleted
      const { content: fileContent } = readObject(repoRoot, fileSha);
      if (isBinaryFile(fileContent)) {
        diffs.push(`Binary file ${name} deleted`);
      } else {
        diffs.push(formatUnifiedDiff(name, '/dev/null', fileContent.toString(), ''));
      }
    } else {
      const stat = fs.lstatSync(fullPath);
      let workingContent: Buffer;

      if (stat.isSymbolicLink()) {
        workingContent = Buffer.from(fs.readlinkSync(fullPath));
      } else {
        workingContent = fs.readFileSync(fullPath);
      }

      const { content: commitFileContent } = readObject(repoRoot, fileSha);

      if (isBinaryFile(commitFileContent) || isBinaryFile(workingContent)) {
        const workingBlobContent = createBlobContent(workingContent);
        const workingSha = hashObject(workingBlobContent);
        if (workingSha !== fileSha) {
          diffs.push(`Binary files a/${name} and b/${name} differ`);
        }
      } else {
        const commitStr = commitFileContent.toString();
        const workingStr = workingContent.toString();
        if (commitStr !== workingStr) {
          diffs.push(formatUnifiedDiff(name, name, commitStr, workingStr));
        }
      }
    }
  }

  return diffs.join('');
}

function diffFileMaps(
  repoRoot: string,
  files1: Map<string, string>,
  files2: Map<string, string>,
  filterPaths: string[]
): string {
  const diffs: string[] = [];
  const allFiles = new Set([...files1.keys(), ...files2.keys()]);

  for (const name of [...allFiles].sort()) {
    if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
      continue;
    }

    const sha1 = files1.get(name);
    const sha2 = files2.get(name);

    if (!sha1) {
      // Added in files2
      const { content } = readObject(repoRoot, sha2!);
      if (isBinaryFile(content)) {
        diffs.push(`Binary file ${name} added`);
      } else {
        diffs.push(formatUnifiedDiff('/dev/null', name, '', content.toString()));
      }
    } else if (!sha2) {
      // Deleted in files2
      const { content } = readObject(repoRoot, sha1);
      if (isBinaryFile(content)) {
        diffs.push(`Binary file ${name} deleted`);
      } else {
        diffs.push(formatUnifiedDiff(name, '/dev/null', content.toString(), ''));
      }
    } else if (sha1 !== sha2) {
      // Modified
      const { content: content1 } = readObject(repoRoot, sha1);
      const { content: content2 } = readObject(repoRoot, sha2);

      if (isBinaryFile(content1) || isBinaryFile(content2)) {
        diffs.push(`Binary files a/${name} and b/${name} differ`);
      } else {
        diffs.push(formatUnifiedDiff(name, name, content1.toString(), content2.toString()));
      }
    }
  }

  return diffs.join('');
}

function collectTreeFiles(repoRoot: string, treeSha: string, prefix: string, files: Map<string, string>): void {
  const { content } = readObject(repoRoot, treeSha);
  const entries = parseTreeContent(content);

  for (const entry of entries) {
    const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      collectTreeFiles(repoRoot, entry.sha, fullName, files);
    } else {
      files.set(fullName, entry.sha);
    }
  }
}

function matchesPath(name: string, filterPaths: string[]): boolean {
  for (const filter of filterPaths) {
    if (name === filter || name.startsWith(filter + '/')) {
      return true;
    }
  }
  return false;
}
