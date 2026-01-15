import { DiffResult, DiffStats } from './types';
/**
 * Get statistics from a diff result.
 */
export declare function getStats(diff: DiffResult): DiffStats;
/**
 * Detect if content appears to be binary (contains null bytes).
 */
export declare function isBinary(content: string): boolean;
/**
 * Convert all line endings to \n.
 */
export declare function normalizeLineEndings(content: string): string;
/**
 * Split content into lines, preserving empty trailing line if present.
 */
export declare function splitLines(content: string): string[];
/**
 * Join lines back into content.
 */
export declare function joinLines(lines: string[]): string;
/**
 * Check if a line is blank (only whitespace).
 */
export declare function isBlankLine(line: string): boolean;
/**
 * Trim whitespace from a line for comparison purposes.
 */
export declare function normalizeForComparison(line: string, ignoreWhitespace: boolean): string;
