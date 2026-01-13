// Type definitions for Mini Git

export interface BlobObject {
  type: 'blob';
  content: Buffer;
}

export interface TreeEntry {
  mode: string;
  name: string;
  sha: string;
}

export interface TreeObject {
  type: 'tree';
  entries: TreeEntry[];
}

export interface CommitObject {
  type: 'commit';
  tree: string;
  parents: string[];
  author: string;
  committer: string;
  message: string;
}

export interface TagObject {
  type: 'tag';
  object: string;
  objectType: string;
  tagName: string;
  tagger: string;
  message: string;
}

export type GitObject = BlobObject | TreeObject | CommitObject | TagObject;

export interface IndexEntry {
  ctimeSec: number;
  ctimeNsec: number;
  mtimeSec: number;
  mtimeNsec: number;
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  sha: string;
  flags: number;
  path: string;
}

export interface Index {
  version: number;
  entries: IndexEntry[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  oldMode?: string;
  newMode?: string;
  hunks: DiffHunk[];
  isBinary?: boolean;
}

export interface StatusEntry {
  path: string;
  indexStatus: string; // A=added, M=modified, D=deleted, ?=untracked
  workTreeStatus: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  mergedContent?: string;
}
