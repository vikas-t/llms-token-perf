"use strict";
// Myers diff algorithm implementation
Object.defineProperty(exports, "__esModule", { value: true });
exports.myersDiff = myersDiff;
exports.createHunks = createHunks;
exports.formatDiff = formatDiff;
exports.diffStrings = diffStrings;
exports.diffFiles = diffFiles;
// Myers diff algorithm
function myersDiff(oldLines, newLines) {
    const n = oldLines.length;
    const m = newLines.length;
    const max = n + m;
    const v = { 1: 0 };
    const trace = [];
    for (let d = 0; d <= max; d++) {
        trace.push({ ...v });
        for (let k = -d; k <= d; k += 2) {
            let x;
            if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
                x = v[k + 1];
            }
            else {
                x = v[k - 1] + 1;
            }
            let y = x - k;
            while (x < n && y < m && oldLines[x] === newLines[y]) {
                x++;
                y++;
            }
            v[k] = x;
            if (x >= n && y >= m) {
                return backtrack(trace, oldLines, newLines);
            }
        }
    }
    return [];
}
function backtrack(trace, oldLines, newLines) {
    const edits = [];
    let x = oldLines.length;
    let y = newLines.length;
    for (let d = trace.length - 1; d >= 0; d--) {
        const v = trace[d];
        const k = x - y;
        let prevK;
        if (k === -d || (k !== d && (v[k - 1] ?? -1) < (v[k + 1] ?? -1))) {
            prevK = k + 1;
        }
        else {
            prevK = k - 1;
        }
        const prevX = v[prevK] ?? 0;
        const prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            x--;
            y--;
            edits.unshift({
                type: 'equal',
                oldLine: oldLines[x],
                newLine: newLines[y],
                oldIndex: x,
                newIndex: y
            });
        }
        if (d > 0) {
            if (x === prevX) {
                y--;
                edits.unshift({
                    type: 'insert',
                    newLine: newLines[y],
                    oldIndex: x,
                    newIndex: y
                });
            }
            else {
                x--;
                edits.unshift({
                    type: 'delete',
                    oldLine: oldLines[x],
                    oldIndex: x,
                    newIndex: y
                });
            }
        }
    }
    return edits;
}
function createHunks(edits, contextLines = 3) {
    const hunks = [];
    let currentHunk = null;
    let lastChangeIndex = -1;
    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        if (edit.type !== 'equal') {
            // Start a new hunk or extend current one
            if (currentHunk === null) {
                // Start new hunk with context before
                const contextStart = Math.max(0, i - contextLines);
                currentHunk = {
                    oldStart: edits[contextStart].oldIndex + 1, // 1-indexed
                    oldCount: 0,
                    newStart: edits[contextStart].newIndex + 1, // 1-indexed
                    newCount: 0,
                    lines: []
                };
                // Add context before
                for (let j = contextStart; j < i; j++) {
                    currentHunk.lines.push(' ' + (edits[j].oldLine || edits[j].newLine || ''));
                    currentHunk.oldCount++;
                    currentHunk.newCount++;
                }
            }
            // Add the change
            if (edit.type === 'delete') {
                currentHunk.lines.push('-' + (edit.oldLine || ''));
                currentHunk.oldCount++;
            }
            else if (edit.type === 'insert') {
                currentHunk.lines.push('+' + (edit.newLine || ''));
                currentHunk.newCount++;
            }
            lastChangeIndex = i;
        }
        else if (currentHunk !== null) {
            // Equal line after a change
            const distanceToLastChange = i - lastChangeIndex;
            if (distanceToLastChange <= contextLines * 2) {
                // Still within context, add as context line
                currentHunk.lines.push(' ' + (edit.oldLine || ''));
                currentHunk.oldCount++;
                currentHunk.newCount++;
            }
            else {
                // Context exceeded, check if we should start a new hunk
                // First, close current hunk
                hunks.push(currentHunk);
                currentHunk = null;
            }
        }
    }
    // Close any remaining hunk
    if (currentHunk !== null) {
        // Trim trailing context to contextLines
        const lastChange = currentHunk.lines.length - 1;
        let trailingContext = 0;
        for (let i = lastChange; i >= 0; i--) {
            if (currentHunk.lines[i].startsWith(' ')) {
                trailingContext++;
            }
            else {
                break;
            }
        }
        if (trailingContext > contextLines) {
            const excess = trailingContext - contextLines;
            currentHunk.lines = currentHunk.lines.slice(0, -excess);
            currentHunk.oldCount -= excess;
            currentHunk.newCount -= excess;
        }
        hunks.push(currentHunk);
    }
    return hunks;
}
function formatDiff(fileDiff) {
    const lines = [];
    // Header
    lines.push(`diff --git a/${fileDiff.oldPath} b/${fileDiff.newPath}`);
    if (fileDiff.isNew) {
        lines.push('new file mode ' + (fileDiff.newMode || '100644'));
    }
    else if (fileDiff.isDeleted) {
        lines.push('deleted file mode ' + (fileDiff.oldMode || '100644'));
    }
    else if (fileDiff.oldMode !== fileDiff.newMode) {
        lines.push(`old mode ${fileDiff.oldMode}`);
        lines.push(`new mode ${fileDiff.newMode}`);
    }
    if (fileDiff.isBinary) {
        lines.push(`Binary files a/${fileDiff.oldPath} and b/${fileDiff.newPath} differ`);
        return lines.join('\n');
    }
    lines.push(`--- ${fileDiff.isNew ? '/dev/null' : 'a/' + fileDiff.oldPath}`);
    lines.push(`+++ ${fileDiff.isDeleted ? '/dev/null' : 'b/' + fileDiff.newPath}`);
    for (const hunk of fileDiff.hunks) {
        lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
        lines.push(...hunk.lines);
    }
    return lines.join('\n');
}
function diffStrings(oldContent, newContent, filename) {
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];
    // Check for binary content
    if (isBinary(oldContent) || isBinary(newContent)) {
        return {
            oldPath: filename,
            newPath: filename,
            hunks: [],
            isBinary: true
        };
    }
    const edits = myersDiff(oldLines, newLines);
    const hunks = createHunks(edits);
    return {
        oldPath: filename,
        newPath: filename,
        hunks,
        isNew: oldContent === '',
        isDeleted: newContent === ''
    };
}
function isBinary(content) {
    // Check for null bytes or other binary indicators
    if (!content)
        return false;
    return content.includes('\0');
}
function diffFiles(oldContent, newContent, options) {
    // Check for binary content
    if (isBinary(oldContent) || isBinary(newContent)) {
        return {
            oldPath: options.oldPath,
            newPath: options.newPath,
            oldMode: options.oldMode,
            newMode: options.newMode,
            hunks: [],
            isBinary: true
        };
    }
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];
    const edits = myersDiff(oldLines, newLines);
    const hunks = createHunks(edits);
    return {
        oldPath: options.oldPath,
        newPath: options.newPath,
        oldMode: options.oldMode,
        newMode: options.newMode,
        hunks,
        isNew: oldContent === '',
        isDeleted: newContent === ''
    };
}
