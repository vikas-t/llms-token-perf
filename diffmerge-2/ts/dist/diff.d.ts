import { DiffHunk, DiffResult, DiffOptions } from './types';
/**
 * Compute line-by-line diff using LCS algorithm.
 */
export declare function diffLines(oldText: string, newText: string, options?: DiffOptions): DiffResult;
/**
 * Compute word-by-word diff within a single line.
 */
export declare function diffWords(oldText: string, newText: string): DiffHunk[];
/**
 * Compute character-by-character diff.
 */
export declare function diffChars(oldText: string, newText: string): DiffHunk[];
