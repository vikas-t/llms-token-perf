// Diff functionality using LCS algorithm

import {
  DiffOp,
  DiffHunk,
  DiffResult,
  DiffStats,
  DiffOptions,
} from './types';
import {
  splitLines,
  normalizeLineEndings,
  isBlankLine,
  normalizeForComparison,
} from './utils';

/**
 * Compute Longest Common Subsequence of two arrays.
 * Returns an array of [oldIndex, newIndex] pairs representing matching elements.
 */
function computeLCS<T>(
  oldArr: T[],
  newArr: T[],
  compare: (a: T, b: T) => boolean
): Array<[number, number]> {
  const m = oldArr.length;
  const n = newArr.length;

  // Build LCS table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (compare(oldArr[i - 1], newArr[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: Array<[number, number]> = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (compare(oldArr[i - 1], newArr[j - 1])) {
      lcs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Generate diff hunks from LCS.
 */
function generateHunksFromLCS<T>(
  oldArr: T[],
  newArr: T[],
  lcs: Array<[number, number]>,
  getContent: (item: T) => string
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldArr.length || newIdx < newArr.length) {
    if (lcsIdx < lcs.length) {
      const [lcsOldIdx, lcsNewIdx] = lcs[lcsIdx];

      // Deletions before match
      while (oldIdx < lcsOldIdx) {
        hunks.push({
          op: 'delete',
          content: getContent(oldArr[oldIdx]),
          old_start: oldIdx + 1,
          old_count: 1,
        });
        oldIdx++;
      }

      // Insertions before match
      while (newIdx < lcsNewIdx) {
        hunks.push({
          op: 'insert',
          content: getContent(newArr[newIdx]),
          new_start: newIdx + 1,
          new_count: 1,
        });
        newIdx++;
      }

      // Equal line
      hunks.push({
        op: 'equal',
        content: getContent(oldArr[oldIdx]),
        old_start: oldIdx + 1,
        new_start: newIdx + 1,
        old_count: 1,
        new_count: 1,
      });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else {
      // After LCS, process remaining
      while (oldIdx < oldArr.length) {
        hunks.push({
          op: 'delete',
          content: getContent(oldArr[oldIdx]),
          old_start: oldIdx + 1,
          old_count: 1,
        });
        oldIdx++;
      }
      while (newIdx < newArr.length) {
        hunks.push({
          op: 'insert',
          content: getContent(newArr[newIdx]),
          new_start: newIdx + 1,
          new_count: 1,
        });
        newIdx++;
      }
    }
  }

  return hunks;
}

/**
 * Compute line-by-line diff using LCS algorithm.
 */
export function diffLines(
  oldText: string,
  newText: string,
  options: DiffOptions = {}
): DiffResult {
  const ignoreWhitespace = options.ignore_whitespace ?? false;
  const ignoreBlankLines = options.ignore_blank_lines ?? false;
  const contextLines = options.context_lines ?? 3;

  // Normalize line endings
  const normalizedOld = normalizeLineEndings(oldText);
  const normalizedNew = normalizeLineEndings(newText);

  // Split into lines
  let oldLines = splitLines(normalizedOld);
  let newLines = splitLines(normalizedNew);

  // Remove trailing empty string if content ends with newline
  // (it's an artifact of split, not an actual empty line)
  if (oldLines.length > 0 && oldLines[oldLines.length - 1] === '' && normalizedOld.endsWith('\n')) {
    oldLines = oldLines.slice(0, -1);
  }
  if (newLines.length > 0 && newLines[newLines.length - 1] === '' && normalizedNew.endsWith('\n')) {
    newLines = newLines.slice(0, -1);
  }

  // For blank line filtering, create filtered versions but keep mapping
  let filteredOldLines = oldLines;
  let filteredNewLines = newLines;
  let oldLineMapping: number[] = oldLines.map((_, i) => i);
  let newLineMapping: number[] = newLines.map((_, i) => i);

  if (ignoreBlankLines) {
    filteredOldLines = [];
    oldLineMapping = [];
    for (let i = 0; i < oldLines.length; i++) {
      if (!isBlankLine(oldLines[i])) {
        filteredOldLines.push(oldLines[i]);
        oldLineMapping.push(i);
      }
    }
    filteredNewLines = [];
    newLineMapping = [];
    for (let i = 0; i < newLines.length; i++) {
      if (!isBlankLine(newLines[i])) {
        filteredNewLines.push(newLines[i]);
        newLineMapping.push(i);
      }
    }
  }

  // Compute LCS
  const compare = (a: string, b: string) => {
    return normalizeForComparison(a, ignoreWhitespace) === normalizeForComparison(b, ignoreWhitespace);
  };
  const lcs = computeLCS(filteredOldLines, filteredNewLines, compare);

  // Generate hunks
  const rawHunks = generateHunksFromLCS(
    filteredOldLines,
    filteredNewLines,
    lcs,
    (line) => line
  );

  // Map back to original line numbers if we filtered
  if (ignoreBlankLines) {
    for (const hunk of rawHunks) {
      if (hunk.old_start !== undefined) {
        const filteredIdx = hunk.old_start - 1;
        if (filteredIdx < oldLineMapping.length) {
          hunk.old_start = oldLineMapping[filteredIdx] + 1;
        }
      }
      if (hunk.new_start !== undefined) {
        const filteredIdx = hunk.new_start - 1;
        if (filteredIdx < newLineMapping.length) {
          hunk.new_start = newLineMapping[filteredIdx] + 1;
        }
      }
    }
  }

  // Apply context filtering if needed
  const hunks = applyContextFilter(rawHunks, contextLines);

  // Calculate stats
  const stats = calculateStats(rawHunks);

  return { hunks, stats };
}

/**
 * Apply context line filtering to hunks.
 */
function applyContextFilter(hunks: DiffHunk[], contextLines: number): DiffHunk[] {
  if (contextLines < 0 || hunks.length === 0) {
    return hunks;
  }

  // Find indices of change hunks (non-equal)
  const changeIndices: number[] = [];
  for (let i = 0; i < hunks.length; i++) {
    if (hunks[i].op !== 'equal') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) {
    // No changes, return all equal hunks (limited context)
    return hunks;
  }

  // Mark which hunks to include (changes plus context)
  const include = new Set<number>();
  for (const idx of changeIndices) {
    // Include the change itself
    include.add(idx);
    // Include context before
    for (let i = 1; i <= contextLines; i++) {
      if (idx - i >= 0) {
        include.add(idx - i);
      }
    }
    // Include context after
    for (let i = 1; i <= contextLines; i++) {
      if (idx + i < hunks.length) {
        include.add(idx + i);
      }
    }
  }

  // Return included hunks in order
  const result: DiffHunk[] = [];
  for (let i = 0; i < hunks.length; i++) {
    if (include.has(i)) {
      result.push(hunks[i]);
    }
  }

  return result;
}

/**
 * Calculate diff statistics.
 */
function calculateStats(hunks: DiffHunk[]): DiffStats {
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    if (hunk.op === 'insert') {
      additions++;
    } else if (hunk.op === 'delete') {
      deletions++;
    }
  }

  // Changes are paired delete+insert (we count minimum of the two)
  const changes = Math.min(additions, deletions);

  return { additions, deletions, changes };
}

/**
 * Compute word-by-word diff within a single line.
 */
export function diffWords(oldText: string, newText: string): DiffHunk[] {
  // Split into words, keeping punctuation and whitespace separate
  const tokenize = (text: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    let currentType: 'word' | 'space' | 'punct' | null = null;

    for (const char of text) {
      let charType: 'word' | 'space' | 'punct';
      if (/\s/.test(char)) {
        charType = 'space';
      } else if (/\w/.test(char)) {
        charType = 'word';
      } else {
        charType = 'punct';
      }

      if (charType !== currentType && current !== '') {
        tokens.push(current);
        current = '';
      }
      current += char;
      currentType = charType;
    }

    if (current !== '') {
      tokens.push(current);
    }

    return tokens;
  };

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const compare = (a: string, b: string) => a === b;
  const lcs = computeLCS(oldTokens, newTokens, compare);

  return generateHunksFromLCS(oldTokens, newTokens, lcs, (token) => token);
}

/**
 * Compute character-by-character diff.
 */
export function diffChars(oldText: string, newText: string): DiffHunk[] {
  const oldChars = [...oldText];
  const newChars = [...newText];

  const compare = (a: string, b: string) => a === b;
  const lcs = computeLCS(oldChars, newChars, compare);

  // Generate hunks and merge consecutive same-op hunks
  const rawHunks = generateHunksFromLCS(oldChars, newChars, lcs, (char) => char);

  // Merge consecutive hunks with same op
  const merged: DiffHunk[] = [];
  for (const hunk of rawHunks) {
    if (merged.length > 0 && merged[merged.length - 1].op === hunk.op) {
      merged[merged.length - 1].content += hunk.content;
    } else {
      merged.push({ ...hunk });
    }
  }

  return merged;
}
