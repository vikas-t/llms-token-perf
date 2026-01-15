// Utility functions for diff/merge library

import { DiffResult, DiffStats } from './types';

/**
 * Get statistics from a diff result.
 */
export function getStats(diff: DiffResult): DiffStats {
  return diff.stats;
}

/**
 * Detect if content appears to be binary (contains null bytes).
 */
export function isBinary(content: string): boolean {
  return content.includes('\x00');
}

/**
 * Convert all line endings to \n.
 */
export function normalizeLineEndings(content: string): string {
  // Replace CRLF first, then CR
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Split content into lines, preserving empty trailing line if present.
 */
export function splitLines(content: string): string[] {
  if (content === '') {
    return [];
  }

  // Split by newline
  const lines = content.split('\n');

  // If content ends with newline, the last element will be empty string
  // We keep it to preserve the "has trailing newline" info
  return lines;
}

/**
 * Join lines back into content.
 */
export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Check if a line is blank (only whitespace).
 */
export function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

/**
 * Trim whitespace from a line for comparison purposes.
 */
export function normalizeForComparison(
  line: string,
  ignoreWhitespace: boolean
): string {
  if (ignoreWhitespace) {
    return line.trim();
  }
  return line;
}
