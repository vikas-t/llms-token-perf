import { MergeResult, MergeOptions, Conflict } from './types';
/**
 * Three-way merge with conflict detection.
 */
export declare function merge3(base: string, ours: string, theirs: string, options?: MergeOptions): MergeResult;
/**
 * Check if content contains conflict markers.
 */
export declare function hasConflicts(content: string): boolean;
/**
 * Extract conflict regions from merged content.
 */
export declare function extractConflicts(content: string): Conflict[];
/**
 * Resolve a specific conflict in the content.
 */
export declare function resolveConflict(content: string, conflictIndex: number, resolution: 'ours' | 'theirs' | 'base' | string): string;
