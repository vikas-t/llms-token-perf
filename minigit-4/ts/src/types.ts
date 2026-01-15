// Type definitions for Mini Git

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
  name: string;
}

export interface TreeEntry {
  mode: string;
  name: string;
  sha: string;
}

export interface CommitInfo {
  tree: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorTimestamp: number;
  authorTz: string;
  committer: string;
  committerEmail: string;
  committerTimestamp: number;
  committerTz: string;
  message: string;
}

export interface TagInfo {
  object: string;
  type: string;
  tag: string;
  tagger: string;
  taggerEmail: string;
  taggerTimestamp: number;
  taggerTz: string;
  message: string;
}

export type ObjectType = 'blob' | 'tree' | 'commit' | 'tag';

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
  hunks: DiffHunk[];
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

export interface MergeConflict {
  path: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
}

export const FILE_MODE = {
  REGULAR: 0o100644,
  EXECUTABLE: 0o100755,
  SYMLINK: 0o120000,
  TREE: 0o40000,
} as const;

export const INDEX_SIGNATURE = 'DIRC';
export const INDEX_VERSION = 2;
