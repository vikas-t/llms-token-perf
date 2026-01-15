import { MergeResult, MergeOptions, Conflict } from './types';
import { splitLines, normalizeLineEndings } from './utils';

/**
 * Compute LCS (Longest Common Subsequence) and return matching indices.
 */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matches: [number, number][] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matches.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

interface Region {
  baseStart: number;
  baseEnd: number;
  content: string[];
}

/**
 * Get changed regions from base to modified version.
 */
function getChangedRegions(baseLines: string[], modLines: string[]): Region[] {
  const lcs = computeLCS(baseLines, modLines);
  const regions: Region[] = [];

  let basePos = 0;
  let modPos = 0;

  for (const [bi, mi] of lcs) {
    if (basePos < bi || modPos < mi) {
      // There's a change here
      regions.push({
        baseStart: basePos,
        baseEnd: bi,
        content: modLines.slice(modPos, mi),
      });
    }
    basePos = bi + 1;
    modPos = mi + 1;
  }

  // Handle end
  if (basePos < baseLines.length || modPos < modLines.length) {
    regions.push({
      baseStart: basePos,
      baseEnd: baseLines.length,
      content: modLines.slice(modPos),
    });
  }

  return regions;
}

/**
 * Check if two regions overlap or touch (which would cause a conflict).
 */
function regionsConflict(r1: Region, r2: Region): boolean {
  // Regions conflict if they touch or overlap in the base
  // Two regions at the same position always conflict (even if both are insertions)
  if (r1.baseStart === r2.baseStart) {
    return true;
  }
  // Otherwise check for overlap
  return !(r1.baseEnd <= r2.baseStart || r2.baseEnd <= r1.baseStart);
}

/**
 * Three-way merge with conflict detection.
 */
export function merge3(
  base: string,
  ours: string,
  theirs: string,
  options: MergeOptions = {}
): MergeResult {
  const conflictStyle = options.conflict_style ?? 'merge';
  const oursLabel = options.ours_label ?? 'ours';
  const theirsLabel = options.theirs_label ?? 'theirs';
  const baseLabel = options.base_label ?? 'base';

  const baseLines = splitLines(normalizeLineEndings(base));
  const ourLines = splitLines(normalizeLineEndings(ours));
  const theirLines = splitLines(normalizeLineEndings(theirs));

  // Get changed regions from each side
  const ourRegions = getChangedRegions(baseLines, ourLines);
  const theirRegions = getChangedRegions(baseLines, theirLines);

  // Build merged result
  const result: string[] = [];
  const conflicts: Conflict[] = [];
  let resultLineNum = 1;

  let ourIdx = 0;
  let theirIdx = 0;
  let basePos = 0;

  while (basePos <= baseLines.length || ourIdx < ourRegions.length || theirIdx < theirRegions.length) {
    const ourRegion = ourIdx < ourRegions.length ? ourRegions[ourIdx] : null;
    const theirRegion = theirIdx < theirRegions.length ? theirRegions[theirIdx] : null;

    // Check if we have a potential conflict
    if (ourRegion && theirRegion && regionsConflict(ourRegion, theirRegion)) {
      // First, copy any unchanged base lines up to the conflict start
      const conflictStart = Math.min(ourRegion.baseStart, theirRegion.baseStart);
      while (basePos < conflictStart && basePos < baseLines.length) {
        result.push(baseLines[basePos]);
        resultLineNum++;
        basePos++;
      }

      // Find the full extent of conflicting regions
      let conflictBaseEnd = Math.max(ourRegion.baseEnd, theirRegion.baseEnd);

      // Collect all our regions that are part of this conflict
      const ourContentParts: string[] = [...ourRegion.content];
      let ourEnd = ourRegion.baseEnd;
      let nextOurIdx = ourIdx + 1;

      // Collect all their regions that are part of this conflict
      const theirContentParts: string[] = [...theirRegion.content];
      let theirEnd = theirRegion.baseEnd;
      let nextTheirIdx = theirIdx + 1;

      const baseContent = baseLines.slice(conflictStart, conflictBaseEnd);
      const ourContent = ourContentParts;
      const theirContent = theirContentParts;

      // Check if both made the same change
      if (JSON.stringify(ourContent) === JSON.stringify(theirContent)) {
        result.push(...ourContent);
        resultLineNum += ourContent.length;
      } else {
        // This is a conflict
        const conflictStartLine = resultLineNum;
        result.push(`<<<<<<< ${oursLabel}`);
        resultLineNum++;
        result.push(...ourContent);
        resultLineNum += ourContent.length;
        if (conflictStyle === 'diff3') {
          result.push(`||||||| ${baseLabel}`);
          resultLineNum++;
          result.push(...baseContent);
          resultLineNum += baseContent.length;
        }
        result.push('=======');
        resultLineNum++;
        result.push(...theirContent);
        resultLineNum += theirContent.length;
        result.push(`>>>>>>> ${theirsLabel}`);
        resultLineNum++;

        conflicts.push({
          base: baseContent.join('\n'),
          ours: ourContent.join('\n'),
          theirs: theirContent.join('\n'),
          start_line: conflictStartLine,
          end_line: resultLineNum - 1,
        });
      }

      basePos = conflictBaseEnd;
      ourIdx = nextOurIdx;
      theirIdx = nextTheirIdx;
    } else if (ourRegion && (!theirRegion || ourRegion.baseStart <= theirRegion.baseStart)) {
      // Only we have a change (or our change comes first)
      // Copy base lines up to our change
      while (basePos < ourRegion.baseStart && basePos < baseLines.length) {
        result.push(baseLines[basePos]);
        resultLineNum++;
        basePos++;
      }

      // Apply our change
      result.push(...ourRegion.content);
      resultLineNum += ourRegion.content.length;
      basePos = ourRegion.baseEnd;
      ourIdx++;
    } else if (theirRegion) {
      // Only they have a change (or their change comes first)
      // Copy base lines up to their change
      while (basePos < theirRegion.baseStart && basePos < baseLines.length) {
        result.push(baseLines[basePos]);
        resultLineNum++;
        basePos++;
      }

      // Apply their change
      result.push(...theirRegion.content);
      resultLineNum += theirRegion.content.length;
      basePos = theirRegion.baseEnd;
      theirIdx++;
    } else {
      // No more changes, copy remaining base lines
      if (basePos < baseLines.length) {
        result.push(baseLines[basePos]);
        resultLineNum++;
      }
      basePos++;
    }
  }

  // Build final content
  let content = result.length > 0 ? result.join('\n') + '\n' : '';

  // Handle empty result case
  if (baseLines.length === 0 && ourLines.length === 0 && theirLines.length === 0) {
    content = '';
  }

  return {
    content,
    has_conflicts: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Check if content contains conflict markers.
 */
export function hasConflicts(content: string): boolean {
  const lines = content.split('\n');
  let hasStart = false;
  let hasMiddle = false;
  let hasEnd = false;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      hasStart = true;
    } else if (line.startsWith('=======')) {
      hasMiddle = true;
    } else if (line.startsWith('>>>>>>>')) {
      hasEnd = true;
    }
  }

  return hasStart && hasMiddle && hasEnd;
}

/**
 * Extract conflict regions from merged content.
 */
export function extractConflicts(content: string): Conflict[] {
  const lines = content.split('\n');
  const conflicts: Conflict[] = [];

  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i + 1;

      // Find ours content
      const oursLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('|||||||') && !lines[i].startsWith('=======')) {
        oursLines.push(lines[i]);
        i++;
      }

      // Handle optional base (diff3 style)
      const baseLines: string[] = [];
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        i++;
        while (i < lines.length && !lines[i].startsWith('=======')) {
          baseLines.push(lines[i]);
          i++;
        }
      }

      // Skip separator
      if (i < lines.length && lines[i].startsWith('=======')) {
        i++;
      }

      // Find theirs content
      const theirsLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirsLines.push(lines[i]);
        i++;
      }

      const endLine = i + 1;

      conflicts.push({
        base: baseLines.join('\n'),
        ours: oursLines.join('\n'),
        theirs: theirsLines.join('\n'),
        start_line: startLine,
        end_line: endLine,
      });

      i++;
    } else {
      i++;
    }
  }

  return conflicts;
}

/**
 * Resolve a specific conflict in the content.
 */
export function resolveConflict(
  content: string,
  conflictIndex: number,
  resolution: 'ours' | 'theirs' | 'base' | string
): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let conflictNum = 0;
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      if (conflictNum === conflictIndex) {
        // Find the parts of this conflict
        const oursLines: string[] = [];
        const baseLines: string[] = [];
        const theirsLines: string[] = [];

        i++;
        while (i < lines.length && !lines[i].startsWith('|||||||') && !lines[i].startsWith('=======')) {
          oursLines.push(lines[i]);
          i++;
        }

        if (i < lines.length && lines[i].startsWith('|||||||')) {
          i++;
          while (i < lines.length && !lines[i].startsWith('=======')) {
            baseLines.push(lines[i]);
            i++;
          }
        }

        if (i < lines.length && lines[i].startsWith('=======')) {
          i++;
        }

        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          theirsLines.push(lines[i]);
          i++;
        }

        // Skip the closing marker
        i++;

        // Apply resolution
        if (resolution === 'ours') {
          result.push(...oursLines);
        } else if (resolution === 'theirs') {
          result.push(...theirsLines);
        } else if (resolution === 'base') {
          result.push(...baseLines);
        } else {
          // Custom resolution text
          const customLines = resolution.split('\n');
          // Remove trailing empty string from split if resolution ends with newline
          if (customLines[customLines.length - 1] === '') {
            customLines.pop();
          }
          result.push(...customLines);
        }

        conflictNum++;
      } else {
        // Keep this conflict as-is
        result.push(lines[i]);
        i++;
        conflictNum++;
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          result.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          result.push(lines[i]);
          i++;
        }
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}
