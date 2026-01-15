import { DiffResult, DiffStats } from "./types";

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
  return content.includes("\0");
}

/**
 * Convert all line endings to \n.
 */
export function normalizeLineEndings(content: string): string {
  // Replace CRLF first, then CR
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Split content into lines, preserving empty trailing line if present.
 */
export function splitLines(content: string): string[] {
  if (content === "") {
    return [];
  }

  // Split by newline
  const lines = content.split("\n");

  // If content ends with newline, the last element will be empty
  // We want to keep track of lines properly
  if (content.endsWith("\n")) {
    // Remove the trailing empty string since it's just indicating the newline
    lines.pop();
  }

  return lines;
}
