import { MergeResult } from './types';
export declare function threeWayMerge(baseContent: string, oursContent: string, theirsContent: string, branchName?: string): MergeResult;
export declare function mergeFiles(baseContent: string | null, oursContent: string | null, theirsContent: string | null, branchName?: string): MergeResult;
export declare function hasConflictMarkers(content: string): boolean;
