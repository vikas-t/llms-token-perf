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
    type: 'blob' | 'tree';
    sha: string;
    name: string;
}
export interface CommitObject {
    tree: string;
    parents: string[];
    author: string;
    committer: string;
    message: string;
}
export interface TagObject {
    object: string;
    type: string;
    tag: string;
    tagger: string;
    message: string;
}
export type ObjectType = 'blob' | 'tree' | 'commit' | 'tag';
export interface GitObject {
    type: ObjectType;
    size: number;
    content: Buffer;
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
    isNew?: boolean;
    isDeleted?: boolean;
}
export interface MergeResult {
    success: boolean;
    conflicts: string[];
    mergedContent?: string;
}
export interface StatusEntry {
    path: string;
    indexStatus: string;
    workStatus: string;
}
