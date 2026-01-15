// Myers diff algorithm implementation

import { DiffHunk, FileDiff } from './types';

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Remove trailing empty line if content ended with newline
  if (oldLines[oldLines.length - 1] === '') oldLines.pop();
  if (newLines[newLines.length - 1] === '') newLines.pop();

  const diff = myersDiff(oldLines, newLines);
  return diff;
}

function myersDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) {
    return [];
  }

  // V array: maps k -> x coordinate
  const v: Map<number, number>[] = [];
  v[0] = new Map();
  v[0].set(0, 0);

  let x: number, y: number;

  // Find shortest edit script
  outer: for (let d = 0; d <= max; d++) {
    v[d + 1] = new Map();

    for (let k = -d; k <= d; k += 2) {
      const vPrev = v[d];

      if (k === -d || (k !== d && (vPrev.get(k - 1) || 0) < (vPrev.get(k + 1) || 0))) {
        x = vPrev.get(k + 1) || 0;
      } else {
        x = (vPrev.get(k - 1) || 0) + 1;
      }

      y = x - k;

      // Follow diagonal
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[d + 1].set(k, x);

      if (x >= n && y >= m) {
        // Found path - backtrack
        return backtrack(v, a, b, d);
      }
    }
  }

  // Should not reach here
  return [];
}

function backtrack(v: Map<number, number>[], a: string[], b: string[], d: number): DiffLine[] {
  const result: DiffLine[] = [];
  let x = a.length;
  let y = b.length;

  const edits: Array<{ type: 'insert' | 'delete' | 'equal'; oldIdx?: number; newIdx?: number; line: string }> = [];

  for (let dIter = d; dIter > 0; dIter--) {
    const k = x - y;
    const vPrev = v[dIter];

    let prevK: number;
    if (k === -dIter || (k !== dIter && (vPrev.get(k - 1) || 0) < (vPrev.get(k + 1) || 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev.get(prevK) || 0;
    const prevY = prevX - prevK;

    // Add diagonal moves (equal lines)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: 'equal', oldIdx: x, newIdx: y, line: a[x] });
    }

    // Add the edit
    if (dIter > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.unshift({ type: 'insert', newIdx: y, line: b[y] });
      } else {
        // Delete
        x--;
        edits.unshift({ type: 'delete', oldIdx: x, line: a[x] });
      }
    }
  }

  // Add remaining diagonal (if any)
  while (x > 0 && y > 0) {
    x--;
    y--;
    edits.unshift({ type: 'equal', oldIdx: x, newIdx: y, line: a[x] });
  }

  // Convert edits to DiffLine format
  let oldLineNo = 1;
  let newLineNo = 1;

  for (const edit of edits) {
    if (edit.type === 'equal') {
      result.push({ type: 'context', content: edit.line, oldLineNo: oldLineNo++, newLineNo: newLineNo++ });
    } else if (edit.type === 'delete') {
      result.push({ type: 'remove', content: edit.line, oldLineNo: oldLineNo++ });
    } else {
      result.push({ type: 'add', content: edit.line, newLineNo: newLineNo++ });
    }
  }

  return result;
}

export function formatUnifiedDiff(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string,
  contextLines: number = 3
): string {
  const diff = computeDiff(oldContent, newContent);

  if (diff.length === 0 || diff.every((d) => d.type === 'context')) {
    return '';
  }

  const hunks = createHunks(diff, contextLines);

  const lines: string[] = [];
  lines.push(`--- a/${oldPath}`);
  lines.push(`+++ b/${newPath}`);

  for (const hunk of hunks) {
    lines.push(formatHunkHeader(hunk));
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}

function createHunks(diff: DiffLine[], contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  // Find ranges of changes
  let i = 0;
  while (i < diff.length) {
    // Skip context until we find a change
    while (i < diff.length && diff[i].type === 'context') {
      i++;
    }

    if (i >= diff.length) break;

    // Start a new hunk
    const startIdx = Math.max(0, i - contextLines);
    let endIdx = i;

    // Find the end of this hunk (including trailing context)
    while (endIdx < diff.length) {
      // Find next change after current position
      let nextChangeIdx = endIdx + 1;
      while (nextChangeIdx < diff.length && diff[nextChangeIdx].type === 'context') {
        nextChangeIdx++;
      }

      if (nextChangeIdx >= diff.length) {
        // No more changes - end hunk with trailing context
        endIdx = Math.min(diff.length, endIdx + contextLines + 1);
        break;
      }

      // Check if next change is close enough to merge
      const gapSize = nextChangeIdx - endIdx - 1;
      if (gapSize <= contextLines * 2) {
        // Merge with next change
        endIdx = nextChangeIdx;
      } else {
        // End this hunk
        endIdx = Math.min(diff.length, endIdx + contextLines + 1);
        break;
      }
    }

    // Build hunk
    const hunkDiff = diff.slice(startIdx, endIdx);
    let oldStart = 1;
    let newStart = 1;
    let oldCount = 0;
    let newCount = 0;

    // Calculate line numbers
    for (let j = 0; j < startIdx; j++) {
      if (diff[j].type === 'context' || diff[j].type === 'remove') {
        oldStart++;
      }
      if (diff[j].type === 'context' || diff[j].type === 'add') {
        newStart++;
      }
    }

    const hunkLines: string[] = [];
    for (const line of hunkDiff) {
      if (line.type === 'context') {
        hunkLines.push(' ' + line.content);
        oldCount++;
        newCount++;
      } else if (line.type === 'remove') {
        hunkLines.push('-' + line.content);
        oldCount++;
      } else {
        hunkLines.push('+' + line.content);
        newCount++;
      }
    }

    hunks.push({
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines,
    });

    i = endIdx;
  }

  return hunks;
}

function formatHunkHeader(hunk: DiffHunk): string {
  const oldRange = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`;
  const newRange = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}`;
  return `@@ -${oldRange} +${newRange} @@`;
}

export function formatDiffStat(diffs: FileDiff[]): string {
  const lines: string[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const diff of diffs) {
    let insertions = 0;
    let deletions = 0;

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) insertions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    totalInsertions += insertions;
    totalDeletions += deletions;

    const path = diff.newPath || diff.oldPath;
    const stats = `${insertions > 0 ? '+' + insertions : ''}${deletions > 0 ? ' -' + deletions : ''}`.trim();
    lines.push(` ${path} | ${insertions + deletions} ${stats}`);
  }

  if (diffs.length > 0) {
    const fileWord = diffs.length === 1 ? 'file' : 'files';
    const summary: string[] = [];
    summary.push(`${diffs.length} ${fileWord} changed`);
    if (totalInsertions > 0) {
      summary.push(`${totalInsertions} insertion${totalInsertions === 1 ? '' : 's'}(+)`);
    }
    if (totalDeletions > 0) {
      summary.push(`${totalDeletions} deletion${totalDeletions === 1 ? '' : 's'}(-)`);
    }
    lines.push(summary.join(', '));
  }

  return lines.join('\n');
}
