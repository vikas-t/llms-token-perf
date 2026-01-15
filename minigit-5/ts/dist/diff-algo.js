"use strict";
// Myers diff algorithm implementation
Object.defineProperty(exports, "__esModule", { value: true });
exports.myersDiff = myersDiff;
exports.editScriptToHunks = editScriptToHunks;
exports.generateDiff = generateDiff;
exports.formatDiff = formatDiff;
exports.formatNewFileDiff = formatNewFileDiff;
exports.formatDeletedFileDiff = formatDeletedFileDiff;
exports.diffStat = diffStat;
exports.formatDiffStat = formatDiffStat;
// Myers diff algorithm - finds shortest edit script
function myersDiff(oldLines, newLines) {
    const n = oldLines.length;
    const m = newLines.length;
    const max = n + m;
    if (max === 0) {
        return [];
    }
    // V[k] = x value of furthest reaching point in diagonal k
    const v = new Map();
    v.set(1, 0);
    // Trace stores the V arrays for each depth
    const trace = [];
    // Forward pass - find shortest edit path
    outer: for (let d = 0; d <= max; d++) {
        trace.push(new Map(v));
        for (let k = -d; k <= d; k += 2) {
            // Choose whether to go down or right
            let x;
            if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
                x = v.get(k + 1) ?? 0;
            }
            else {
                x = (v.get(k - 1) ?? 0) + 1;
            }
            let y = x - k;
            // Follow diagonal (matching lines)
            while (x < n && y < m && oldLines[x] === newLines[y]) {
                x++;
                y++;
            }
            v.set(k, x);
            if (x >= n && y >= m) {
                break outer;
            }
        }
    }
    // Backtrack to find edit script
    const edits = [];
    let x = n;
    let y = m;
    // trace[d] contains state BEFORE processing depth d
    // So trace[d] = state after processing depth d-1
    // When backtracking from depth d, we need state after d-1, which is trace[d]
    for (let d = trace.length - 1; d > 0; d--) {
        const vPrev = trace[d]; // State after processing d-1
        const k = x - y;
        let prevK;
        if (k === -d || (k !== d && (vPrev.get(k - 1) ?? 0) < (vPrev.get(k + 1) ?? 0))) {
            prevK = k + 1;
        }
        else {
            prevK = k - 1;
        }
        const prevX = vPrev.get(prevK) ?? 0;
        const prevY = prevX - prevK;
        // Add diagonal moves (equal lines)
        while (x > prevX && y > prevY) {
            x--;
            y--;
            edits.unshift({ op: 'equal', oldLine: x, newLine: y, text: oldLines[x] });
        }
        // Add insert or delete
        if (x === prevX) {
            // Insert
            y--;
            edits.unshift({ op: 'insert', newLine: y, text: newLines[y] });
        }
        else {
            // Delete
            x--;
            edits.unshift({ op: 'delete', oldLine: x, text: oldLines[x] });
        }
    }
    // Handle d=0: any remaining diagonal matches from the start
    while (x > 0 && y > 0 && oldLines[x - 1] === newLines[y - 1]) {
        x--;
        y--;
        edits.unshift({ op: 'equal', oldLine: x, newLine: y, text: oldLines[x] });
    }
    return edits;
}
// Convert edit script to unified diff hunks
function editScriptToHunks(edits, contextLines = 3) {
    if (edits.length === 0) {
        return [];
    }
    const hunks = [];
    let currentHunk = null;
    let lastChangeIdx = -1;
    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const isChange = edit.op !== 'equal';
        if (isChange) {
            // Start new hunk if needed
            if (!currentHunk || i - lastChangeIdx > contextLines * 2) {
                // Finalize previous hunk with trailing context
                if (currentHunk) {
                    // Add trailing context from previous hunk
                    const trailingStart = lastChangeIdx + 1;
                    const trailingEnd = Math.min(trailingStart + contextLines, i);
                    for (let j = trailingStart; j < trailingEnd; j++) {
                        if (edits[j].op === 'equal') {
                            currentHunk.lines.push(' ' + edits[j].text);
                            currentHunk.oldCount++;
                            currentHunk.newCount++;
                        }
                    }
                    hunks.push(currentHunk);
                }
                // Start new hunk with leading context
                const contextStart = Math.max(0, i - contextLines);
                let oldStart = 1;
                let newStart = 1;
                // Calculate start positions
                for (let j = 0; j < contextStart; j++) {
                    if (edits[j].op === 'delete' || edits[j].op === 'equal')
                        oldStart++;
                    if (edits[j].op === 'insert' || edits[j].op === 'equal')
                        newStart++;
                }
                currentHunk = {
                    oldStart,
                    oldCount: 0,
                    newStart,
                    newCount: 0,
                    lines: [],
                };
                // Add leading context
                for (let j = contextStart; j < i; j++) {
                    if (edits[j].op === 'equal') {
                        currentHunk.lines.push(' ' + edits[j].text);
                        currentHunk.oldCount++;
                        currentHunk.newCount++;
                    }
                }
            }
            else {
                // Add intervening context lines to current hunk
                for (let j = lastChangeIdx + 1; j < i; j++) {
                    if (edits[j].op === 'equal' && currentHunk) {
                        currentHunk.lines.push(' ' + edits[j].text);
                        currentHunk.oldCount++;
                        currentHunk.newCount++;
                    }
                }
            }
            // Add the change
            if (currentHunk) {
                if (edit.op === 'delete') {
                    currentHunk.lines.push('-' + edit.text);
                    currentHunk.oldCount++;
                }
                else if (edit.op === 'insert') {
                    currentHunk.lines.push('+' + edit.text);
                    currentHunk.newCount++;
                }
            }
            lastChangeIdx = i;
        }
    }
    // Finalize last hunk
    if (currentHunk) {
        const trailingStart = lastChangeIdx + 1;
        const trailingEnd = Math.min(trailingStart + contextLines, edits.length);
        for (let j = trailingStart; j < trailingEnd; j++) {
            if (edits[j].op === 'equal') {
                currentHunk.lines.push(' ' + edits[j].text);
                currentHunk.oldCount++;
                currentHunk.newCount++;
            }
        }
        hunks.push(currentHunk);
    }
    return hunks;
}
// Generate unified diff between two strings
function generateDiff(oldContent, newContent, oldPath, newPath, contextLines = 3) {
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];
    // Remove trailing empty line if content ends with newline
    if (oldLines.length > 0 && oldLines[oldLines.length - 1] === '') {
        oldLines.pop();
    }
    if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
        newLines.pop();
    }
    const edits = myersDiff(oldLines, newLines);
    const hunks = editScriptToHunks(edits, contextLines);
    return {
        oldPath,
        newPath,
        hunks,
    };
}
// Format a FileDiff to unified diff string
function formatDiff(diff) {
    if (diff.isBinary) {
        return `Binary files ${diff.oldPath} and ${diff.newPath} differ\n`;
    }
    if (diff.hunks.length === 0) {
        return '';
    }
    const lines = [];
    // Header
    lines.push(`--- a/${diff.oldPath}`);
    lines.push(`+++ b/${diff.newPath}`);
    // Hunks
    for (const hunk of diff.hunks) {
        const oldRange = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`;
        const newRange = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}`;
        lines.push(`@@ -${oldRange} +${newRange} @@`);
        lines.push(...hunk.lines);
    }
    return lines.join('\n') + '\n';
}
// Format diff for new file
function formatNewFileDiff(content, path) {
    const lines = [];
    lines.push(`--- /dev/null`);
    lines.push(`+++ b/${path}`);
    const contentLines = content.split('\n');
    if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
        contentLines.pop();
    }
    if (contentLines.length > 0) {
        lines.push(`@@ -0,0 +1,${contentLines.length} @@`);
        for (const line of contentLines) {
            lines.push('+' + line);
        }
    }
    return lines.join('\n') + '\n';
}
// Format diff for deleted file
function formatDeletedFileDiff(content, path) {
    const lines = [];
    lines.push(`--- a/${path}`);
    lines.push(`+++ /dev/null`);
    const contentLines = content.split('\n');
    if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
        contentLines.pop();
    }
    if (contentLines.length > 0) {
        lines.push(`@@ -1,${contentLines.length} +0,0 @@`);
        for (const line of contentLines) {
            lines.push('-' + line);
        }
    }
    return lines.join('\n') + '\n';
}
// Calculate diff stat
function diffStat(diffs) {
    let insertions = 0;
    let deletions = 0;
    for (const diff of diffs) {
        for (const hunk of diff.hunks) {
            for (const line of hunk.lines) {
                if (line.startsWith('+'))
                    insertions++;
                if (line.startsWith('-'))
                    deletions++;
            }
        }
    }
    return { insertions, deletions };
}
// Format diff stat line
function formatDiffStat(diffs) {
    const lines = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    for (const diff of diffs) {
        let insertions = 0;
        let deletions = 0;
        for (const hunk of diff.hunks) {
            for (const line of hunk.lines) {
                if (line.startsWith('+'))
                    insertions++;
                if (line.startsWith('-'))
                    deletions++;
            }
        }
        totalInsertions += insertions;
        totalDeletions += deletions;
        const path = diff.newPath || diff.oldPath;
        const plusses = '+'.repeat(Math.min(insertions, 50));
        const minuses = '-'.repeat(Math.min(deletions, 50));
        lines.push(` ${path} | ${insertions + deletions} ${plusses}${minuses}`);
    }
    const summary = ` ${diffs.length} file${diffs.length !== 1 ? 's' : ''} changed` +
        (totalInsertions > 0 ? `, ${totalInsertions} insertion${totalInsertions !== 1 ? 's' : ''}(+)` : '') +
        (totalDeletions > 0 ? `, ${totalDeletions} deletion${totalDeletions !== 1 ? 's' : ''}(-)` : '');
    return lines.join('\n') + '\n' + summary + '\n';
}
