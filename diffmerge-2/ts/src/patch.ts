// Patch creation and application

import {
  PatchOptions,
  ApplyResult,
  ParsedPatch,
  PatchHunk,
  PatchLine,
  ParseError,
} from './types';
import { diffLines } from './diff';
import { normalizeLineEndings, splitLines } from './utils';

/**
 * Generate unified diff format patch.
 */
export function createPatch(
  oldText: string,
  newText: string,
  options: PatchOptions = {}
): string {
  const oldFile = options.old_file ?? 'a';
  const newFile = options.new_file ?? 'b';
  const contextLines = options.context_lines ?? 3;

  // Normalize line endings
  const normalizedOld = normalizeLineEndings(oldText);
  const normalizedNew = normalizeLineEndings(newText);

  // Get diff with context
  const diff = diffLines(normalizedOld, normalizedNew, { context_lines: contextLines });

  // Group hunks into patch hunks
  const patchHunks = groupIntoPatchHunks(diff.hunks, contextLines);

  // Build patch string
  const lines: string[] = [];
  lines.push(`--- ${oldFile}`);
  lines.push(`+++ ${newFile}`);

  for (const hunk of patchHunks) {
    // Clean up trailing empty context lines (lines that are just ' ')
    while (hunk.lines.length > 0 && hunk.lines[hunk.lines.length - 1] === ' ') {
      hunk.lines.pop();
      hunk.oldCount--;
      hunk.newCount--;
    }
    // Skip empty hunks
    if (hunk.lines.length === 0) {
      continue;
    }

    // Calculate hunk header
    const oldStart = hunk.oldStart;
    const oldCount = hunk.oldCount;
    const newStart = hunk.newStart;
    const newCount = hunk.newCount;

    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

    // Add hunk lines
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }

  return lines.join('\n') + (lines.length > 2 ? '\n' : '');
}

interface PatchHunkBuilder {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

/**
 * Group diff hunks into unified patch hunks.
 */
function groupIntoPatchHunks(
  hunks: Array<{ op: string; content: string; old_start?: number; new_start?: number }>,
  contextLines: number
): PatchHunkBuilder[] {
  if (hunks.length === 0) {
    return [];
  }

  // Check if there are any changes
  const hasChanges = hunks.some((h) => h.op !== 'equal');
  if (!hasChanges) {
    return [];
  }

  // Find change boundaries
  const patchHunks: PatchHunkBuilder[] = [];
  let currentHunk: PatchHunkBuilder | null = null;
  let lastChangeEnd = -1;

  // Track line numbers
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    const isChange = hunk.op !== 'equal';

    if (isChange) {
      if (currentHunk === null) {
        // Start new patch hunk
        currentHunk = {
          oldStart: oldLine,
          oldCount: 0,
          newStart: newLine,
          newCount: 0,
          lines: [],
        };
      }
      lastChangeEnd = i;
    }

    if (currentHunk !== null) {
      // Add line to current hunk
      if (hunk.op === 'equal') {
        currentHunk.lines.push(' ' + hunk.content);
        currentHunk.oldCount++;
        currentHunk.newCount++;
      } else if (hunk.op === 'delete') {
        currentHunk.lines.push('-' + hunk.content);
        currentHunk.oldCount++;
      } else if (hunk.op === 'insert') {
        currentHunk.lines.push('+' + hunk.content);
        currentHunk.newCount++;
      }

      // Check if we should end this hunk
      // (if we've gone contextLines past the last change and there's more content)
      if (
        hunk.op === 'equal' &&
        i - lastChangeEnd >= contextLines &&
        i < hunks.length - 1
      ) {
        // Check if there's another change coming within contextLines
        let anotherChangeComing = false;
        for (let j = i + 1; j < hunks.length && j <= i + contextLines * 2; j++) {
          if (hunks[j].op !== 'equal') {
            anotherChangeComing = true;
            break;
          }
        }

        if (!anotherChangeComing) {
          // End this hunk
          patchHunks.push(currentHunk);
          currentHunk = null;
        }
      }
    }

    // Update line numbers
    if (hunk.op === 'equal' || hunk.op === 'delete') {
      oldLine++;
    }
    if (hunk.op === 'equal' || hunk.op === 'insert') {
      newLine++;
    }
  }

  // Add last hunk if any
  if (currentHunk !== null) {
    patchHunks.push(currentHunk);
  }

  return patchHunks;
}

/**
 * Apply a unified diff patch to content.
 */
export function applyPatch(content: string, patch: string): ApplyResult {
  const normalizedContent = normalizeLineEndings(content);
  let lines = splitLines(normalizedContent);

  // Handle trailing newline
  if (lines.length > 0 && lines[lines.length - 1] === '' && normalizedContent.endsWith('\n')) {
    lines = lines.slice(0, -1);
  }

  const errors: string[] = [];
  let hunksApplied = 0;
  let hunksFailed = 0;

  // Parse the patch
  let parsed: ParsedPatch;
  try {
    parsed = parsePatch(patch);
  } catch (e) {
    // Empty or invalid patch - no changes needed
    return {
      content: normalizedContent,
      success: true,
      hunks_applied: 0,
      hunks_failed: 0,
      errors: [],
    };
  }

  // Apply hunks in reverse order to preserve line numbers
  const sortedHunks = [...parsed.hunks].sort(
    (a, b) => b.old_start - a.old_start
  );

  for (const hunk of sortedHunks) {
    const result = applyHunk(lines, hunk);
    if (result.success) {
      lines = result.lines;
      hunksApplied++;
    } else {
      hunksFailed++;
      errors.push(result.error || 'Unknown error');
    }
  }

  // Reconstruct content
  let resultContent = lines.join('\n');
  // Add trailing newline if original had one or if we made changes
  if (lines.length > 0) {
    resultContent += '\n';
  }

  return {
    content: resultContent,
    success: hunksFailed === 0,
    hunks_applied: hunksApplied,
    hunks_failed: hunksFailed,
    errors,
  };
}

interface HunkApplyResult {
  success: boolean;
  lines: string[];
  error?: string;
}

/**
 * Apply a single hunk to content lines.
 */
function applyHunk(lines: string[], hunk: PatchHunk): HunkApplyResult {
  // Extract context and expected deletions from hunk
  const contextAndDeletions: Array<{ content: string; mustDelete: boolean }> = [];
  const insertions: string[] = [];

  for (const line of hunk.lines) {
    if (line.op === ' ') {
      contextAndDeletions.push({ content: line.content, mustDelete: false });
    } else if (line.op === '-') {
      contextAndDeletions.push({ content: line.content, mustDelete: true });
    } else if (line.op === '+') {
      insertions.push(line.content);
    }
  }

  // Try to find a matching position
  // Start at the hunk's suggested position (0-indexed)
  const startPos = hunk.old_start - 1;

  // Try exact match first
  let matchPos = findMatch(lines, contextAndDeletions, startPos);

  // If no exact match, try fuzzy matching (offset adjustment)
  if (matchPos === -1) {
    // Try offsets up to 10 lines in both directions
    for (let offset = 1; offset <= 10; offset++) {
      matchPos = findMatch(lines, contextAndDeletions, startPos + offset);
      if (matchPos !== -1) break;
      matchPos = findMatch(lines, contextAndDeletions, startPos - offset);
      if (matchPos !== -1) break;
    }
  }

  if (matchPos === -1) {
    return {
      success: false,
      lines,
      error: `Hunk at line ${hunk.old_start} does not match content`,
    };
  }

  // Apply the hunk
  const newLines = [...lines];

  // Remove old lines (context + deletions) and insert new content
  const removeCount = contextAndDeletions.length;

  // Build replacement: context lines + insertions (in correct positions)
  const replacement: string[] = [];
  let hunkLineIdx = 0;

  for (const line of hunk.lines) {
    if (line.op === ' ') {
      replacement.push(line.content);
    } else if (line.op === '+') {
      replacement.push(line.content);
    }
    // Skip deletions (they're being removed)
  }

  newLines.splice(matchPos, removeCount, ...replacement);

  return {
    success: true,
    lines: newLines,
  };
}

/**
 * Find where the hunk matches in the content.
 */
function findMatch(
  lines: string[],
  expected: Array<{ content: string; mustDelete: boolean }>,
  startPos: number
): number {
  if (startPos < 0 || startPos > lines.length) {
    return -1;
  }

  if (expected.length === 0) {
    return startPos;
  }

  // Check if all expected lines match at startPos
  if (startPos + expected.length > lines.length) {
    return -1;
  }

  for (let i = 0; i < expected.length; i++) {
    if (lines[startPos + i] !== expected[i].content) {
      return -1;
    }
  }

  return startPos;
}

/**
 * Reverse a patch (swap additions and deletions).
 */
export function reversePatch(patch: string): string {
  const parsed = parsePatch(patch);
  const lines: string[] = [];

  // Swap file names
  lines.push(`--- ${parsed.new_file}`);
  lines.push(`+++ ${parsed.old_file}`);

  for (const hunk of parsed.hunks) {
    // Swap old/new in header
    lines.push(
      `@@ -${hunk.new_start},${hunk.new_count} +${hunk.old_start},${hunk.old_count} @@`
    );

    // Swap +/- in lines
    for (const line of hunk.lines) {
      if (line.op === '+') {
        lines.push('-' + line.content);
      } else if (line.op === '-') {
        lines.push('+' + line.content);
      } else {
        lines.push(' ' + line.content);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Parse unified diff format into structured data.
 */
export function parsePatch(patch: string): ParsedPatch {
  const lines = patch.split('\n');
  let oldFile = '';
  let newFile = '';
  const hunks: PatchHunk[] = [];
  let currentHunk: PatchHunk | null = null;

  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('--- ')) {
      oldFile = line.slice(4);
      foundHeader = true;
    } else if (line.startsWith('+++ ')) {
      newFile = line.slice(4);
    } else if (line.startsWith('@@')) {
      // Parse hunk header: @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          old_start: parseInt(match[1]),
          old_count: match[2] ? parseInt(match[2]) : 1,
          new_start: parseInt(match[3]),
          new_count: match[4] ? parseInt(match[4]) : 1,
          lines: [],
        };
      }
    } else if (currentHunk) {
      // Parse hunk content
      if (line.startsWith('+')) {
        currentHunk.lines.push({ op: '+', content: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ op: '-', content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({ op: ' ', content: line.slice(1) });
      }
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // Clean up trailing empty context lines from each hunk
  for (const hunk of hunks) {
    while (hunk.lines.length > 0 &&
           hunk.lines[hunk.lines.length - 1].op === ' ' &&
           hunk.lines[hunk.lines.length - 1].content === '') {
      hunk.lines.pop();
    }
  }

  if (!foundHeader) {
    throw new ParseError('Invalid patch format: missing header');
  }

  return { old_file: oldFile, new_file: newFile, hunks };
}
