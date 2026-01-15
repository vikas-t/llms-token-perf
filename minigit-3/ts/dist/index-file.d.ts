import { IndexEntry } from './types';
export declare function readIndex(repoRoot?: string): IndexEntry[];
export declare function writeIndex(entries: IndexEntry[], repoRoot?: string): void;
export declare function addToIndex(entry: IndexEntry, repoRoot?: string): void;
export declare function removeFromIndex(name: string, repoRoot?: string): void;
export declare function getIndexEntry(name: string, repoRoot?: string): IndexEntry | undefined;
export declare function clearIndex(repoRoot?: string): void;
