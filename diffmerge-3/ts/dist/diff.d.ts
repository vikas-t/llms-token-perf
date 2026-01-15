import { DiffHunk, DiffResult, DiffOptions } from './types';
/**
 * Line-by-line diff using LCS algorithm.
 */
export declare function diffLines(oldStr: string, newStr: string, options?: DiffOptions): DiffResult;
/**
 * Word-by-word diff.
 */
export declare function diffWords(oldStr: string, newStr: string): DiffHunk[];
/**
 * Character-by-character diff.
 */
export declare function diffChars(oldStr: string, newStr: string): DiffHunk[];
