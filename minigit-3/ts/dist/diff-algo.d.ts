import { DiffHunk, FileDiff } from './types';
interface Edit {
    type: 'insert' | 'delete' | 'equal';
    oldLine?: string;
    newLine?: string;
    oldIndex: number;
    newIndex: number;
}
export declare function myersDiff(oldLines: string[], newLines: string[]): Edit[];
export declare function createHunks(edits: Edit[], contextLines?: number): DiffHunk[];
export declare function formatDiff(fileDiff: FileDiff): string;
export declare function diffStrings(oldContent: string, newContent: string, filename: string): FileDiff;
export declare function diffFiles(oldContent: string, newContent: string, options: {
    oldPath: string;
    newPath: string;
    oldMode?: string;
    newMode?: string;
}): FileDiff;
export {};
