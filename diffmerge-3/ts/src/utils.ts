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
 * Normalize all line endings to \n.
 */
export function normalizeLineEndings(content: string): string {
  // First replace CRLF, then CR
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Split content into lines, preserving empty trailing line if present.
 */
export function splitLines(content: string): string[] {
  if (content === '') {
    return [];
  }

  const normalized = normalizeLineEndings(content);
  const lines = normalized.split('\n');

  // If content ends with newline, the split creates an extra empty string
  // We need to handle this correctly
  if (normalized.endsWith('\n') && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}
