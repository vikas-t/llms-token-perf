// Three-way merge with conflict detection

import { MergeResult } from './types';

interface DiffOp {
  type: 'equal' | 'insert' | 'delete';
  lines: string[];
  baseStart: number;
  baseEnd: number;
}

// Simple LCS-based diff for merge
function diff3Lines(base: string[], other: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let bi = 0;
  let oi = 0;

  // Build a map of base line positions for quick lookup
  const baseMap = new Map<string, number[]>();
  for (let i = 0; i < base.length; i++) {
    const line = base[i];
    if (!baseMap.has(line)) {
      baseMap.set(line, []);
    }
    baseMap.get(line)!.push(i);
  }

  while (bi < base.length || oi < other.length) {
    if (bi >= base.length) {
      // Insert remaining other lines
      ops.push({
        type: 'insert',
        lines: other.slice(oi),
        baseStart: bi,
        baseEnd: bi,
      });
      break;
    }

    if (oi >= other.length) {
      // Delete remaining base lines
      ops.push({
        type: 'delete',
        lines: base.slice(bi),
        baseStart: bi,
        baseEnd: base.length,
      });
      break;
    }

    if (base[bi] === other[oi]) {
      // Equal
      const startBi = bi;
      const equalLines: string[] = [];
      while (bi < base.length && oi < other.length && base[bi] === other[oi]) {
        equalLines.push(base[bi]);
        bi++;
        oi++;
      }
      ops.push({
        type: 'equal',
        lines: equalLines,
        baseStart: startBi,
        baseEnd: bi,
      });
    } else {
      // Find next sync point
      let foundSync = false;
      let syncBi = bi;
      let syncOi = oi;

      // Look ahead in other to find a matching base line
      for (let look = oi; look < Math.min(oi + 100, other.length); look++) {
        const positions = baseMap.get(other[look]);
        if (positions) {
          for (const pos of positions) {
            if (pos >= bi) {
              syncBi = pos;
              syncOi = look;
              foundSync = true;
              break;
            }
          }
        }
        if (foundSync) break;
      }

      if (!foundSync) {
        // No sync found, consume rest
        if (bi < base.length) {
          ops.push({
            type: 'delete',
            lines: base.slice(bi),
            baseStart: bi,
            baseEnd: base.length,
          });
        }
        if (oi < other.length) {
          ops.push({
            type: 'insert',
            lines: other.slice(oi),
            baseStart: base.length,
            baseEnd: base.length,
          });
        }
        break;
      }

      // Delete lines from base up to sync
      if (syncBi > bi) {
        ops.push({
          type: 'delete',
          lines: base.slice(bi, syncBi),
          baseStart: bi,
          baseEnd: syncBi,
        });
      }

      // Insert lines from other up to sync
      if (syncOi > oi) {
        ops.push({
          type: 'insert',
          lines: other.slice(oi, syncOi),
          baseStart: syncBi,
          baseEnd: syncBi,
        });
      }

      bi = syncBi;
      oi = syncOi;
    }
  }

  return ops;
}

// Three-way merge
export function merge3(
  base: string,
  ours: string,
  theirs: string,
  oursLabel: string = 'HEAD',
  theirsLabel: string = 'incoming'
): MergeResult {
  const baseLines = base.split('\n');
  const ourLines = ours.split('\n');
  const theirLines = theirs.split('\n');

  // Remove trailing empty line from split if content ended with newline
  if (baseLines.length > 0 && baseLines[baseLines.length - 1] === '' && base.endsWith('\n')) {
    baseLines.pop();
  }
  if (ourLines.length > 0 && ourLines[ourLines.length - 1] === '' && ours.endsWith('\n')) {
    ourLines.pop();
  }
  if (theirLines.length > 0 && theirLines[theirLines.length - 1] === '' && theirs.endsWith('\n')) {
    theirLines.pop();
  }

  // Get diffs from base to each side
  const ourDiff = diff3Lines(baseLines, ourLines);
  const theirDiff = diff3Lines(baseLines, theirLines);

  const result: string[] = [];
  const conflicts: string[] = [];

  let baseIdx = 0;
  let ourDiffIdx = 0;
  let theirDiffIdx = 0;

  while (baseIdx < baseLines.length || ourDiffIdx < ourDiff.length || theirDiffIdx < theirDiff.length) {
    const ourOp = ourDiffIdx < ourDiff.length ? ourDiff[ourDiffIdx] : null;
    const theirOp = theirDiffIdx < theirDiff.length ? theirDiff[theirDiffIdx] : null;

    // Both at or past end
    if (!ourOp && !theirOp) break;

    // Only one side has changes
    if (!ourOp) {
      if (theirOp!.type === 'equal') {
        result.push(...theirOp!.lines);
      } else if (theirOp!.type === 'insert') {
        result.push(...theirOp!.lines);
      }
      theirDiffIdx++;
      continue;
    }

    if (!theirOp) {
      if (ourOp!.type === 'equal') {
        result.push(...ourOp!.lines);
      } else if (ourOp!.type === 'insert') {
        result.push(...ourOp!.lines);
      }
      ourDiffIdx++;
      continue;
    }

    // Both have operations - check for overlap
    const ourStart = ourOp.baseStart;
    const ourEnd = ourOp.baseEnd;
    const theirStart = theirOp.baseStart;
    const theirEnd = theirOp.baseEnd;

    // Both equal at same position
    if (ourOp.type === 'equal' && theirOp.type === 'equal' && ourStart === theirStart) {
      // Take the shorter equal section
      const minLen = Math.min(ourOp.lines.length, theirOp.lines.length);
      result.push(...ourOp.lines.slice(0, minLen));

      if (ourOp.lines.length <= theirOp.lines.length) {
        ourDiffIdx++;
        if (theirOp.lines.length > minLen) {
          theirDiff[theirDiffIdx] = {
            ...theirOp,
            lines: theirOp.lines.slice(minLen),
            baseStart: theirStart + minLen,
          };
        } else {
          theirDiffIdx++;
        }
      } else {
        theirDiffIdx++;
        ourDiff[ourDiffIdx] = {
          ...ourOp,
          lines: ourOp.lines.slice(minLen),
          baseStart: ourStart + minLen,
        };
      }
      baseIdx = Math.max(ourEnd, theirEnd);
      continue;
    }

    // One side is equal, other has changes
    if (ourOp.type === 'equal' && theirOp.type !== 'equal') {
      if (theirOp.type === 'insert') {
        result.push(...theirOp.lines);
        theirDiffIdx++;
      } else {
        // Their delete - skip those base lines from our equal
        theirDiffIdx++;
      }
      continue;
    }

    if (theirOp.type === 'equal' && ourOp.type !== 'equal') {
      if (ourOp.type === 'insert') {
        result.push(...ourOp.lines);
        ourDiffIdx++;
      } else {
        // Our delete - skip those base lines from their equal
        ourDiffIdx++;
      }
      continue;
    }

    // Both sides have non-equal changes at overlapping regions - potential conflict
    // Check if changes are identical
    if (ourOp.type === theirOp.type &&
        ourOp.lines.length === theirOp.lines.length &&
        ourOp.lines.every((line, i) => line === theirOp.lines[i])) {
      // Identical changes - no conflict
      if (ourOp.type === 'insert') {
        result.push(...ourOp.lines);
      }
      // For delete, just skip
      ourDiffIdx++;
      theirDiffIdx++;
      continue;
    }

    // Different changes - conflict
    conflicts.push(`lines ${ourStart + 1}-${ourEnd}`);

    // Add conflict markers
    result.push(`<<<<<<< ${oursLabel}`);
    if (ourOp.type === 'insert') {
      result.push(...ourOp.lines);
    } else if (ourOp.type === 'delete') {
      // Show nothing for delete on our side
    }
    result.push('=======');
    if (theirOp.type === 'insert') {
      result.push(...theirOp.lines);
    } else if (theirOp.type === 'delete') {
      // Show nothing for delete on their side
    }
    result.push(`>>>>>>> ${theirsLabel}`);

    ourDiffIdx++;
    theirDiffIdx++;
  }

  // Add trailing newline if original had one
  const mergedContent = result.join('\n') + (result.length > 0 ? '\n' : '');

  return {
    success: conflicts.length === 0,
    conflicts,
    mergedContent,
  };
}

// Simple file merge - takes content directly
export function mergeFiles(
  baseContent: string | null,
  ourContent: string,
  theirContent: string,
  oursLabel: string = 'HEAD',
  theirsLabel: string = 'incoming'
): MergeResult {
  // If base is null (new file on both sides), just mark as conflict
  if (baseContent === null) {
    if (ourContent === theirContent) {
      return { success: true, conflicts: [], mergedContent: ourContent };
    }

    const result = [
      `<<<<<<< ${oursLabel}`,
      ...ourContent.split('\n').slice(0, -1), // Remove trailing empty from split
      '=======',
      ...theirContent.split('\n').slice(0, -1),
      `>>>>>>> ${theirsLabel}`,
    ].join('\n') + '\n';

    return {
      success: false,
      conflicts: ['entire file'],
      mergedContent: result,
    };
  }

  return merge3(baseContent, ourContent, theirContent, oursLabel, theirsLabel);
}

// Find common ancestor (merge base) between two commits
export function findMergeBase(commit1: string, commit2: string, repoRoot?: string): string | null {
  const { getCommit } = require('./objects');

  // BFS from both commits to find common ancestor
  const ancestors1 = new Set<string>();
  const queue1 = [commit1];

  // Get all ancestors of commit1
  while (queue1.length > 0) {
    const sha = queue1.shift()!;
    if (ancestors1.has(sha)) continue;
    ancestors1.add(sha);

    try {
      const commit = getCommit(sha, repoRoot);
      queue1.push(...commit.parents);
    } catch {
      // Commit not found
    }
  }

  // BFS from commit2 to find first common ancestor
  const visited = new Set<string>();
  const queue2 = [commit2];

  while (queue2.length > 0) {
    const sha = queue2.shift()!;
    if (visited.has(sha)) continue;
    visited.add(sha);

    if (ancestors1.has(sha)) {
      return sha;
    }

    try {
      const commit = getCommit(sha, repoRoot);
      queue2.push(...commit.parents);
    } catch {
      // Commit not found
    }
  }

  return null;
}
