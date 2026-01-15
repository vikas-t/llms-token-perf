"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPatch = createPatch;
exports.applyPatch = applyPatch;
exports.reversePatch = reversePatch;
exports.parsePatch = parsePatch;
const types_1 = require("./types");
const utils_1 = require("./utils");
const diff_1 = require("./diff");
/**
 * Generate unified diff format patch.
 */
function createPatch(oldStr, newStr, options = {}) {
    const oldFile = options.old_file ?? 'a';
    const newFile = options.new_file ?? 'b';
    const contextLines = options.context_lines ?? 3;
    const oldContent = (0, utils_1.normalizeLineEndings)(oldStr);
    const newContent = (0, utils_1.normalizeLineEndings)(newStr);
    const oldLines = (0, utils_1.splitLines)(oldContent);
    const newLines = (0, utils_1.splitLines)(newContent);
    // Get diff with full context initially
    const diff = (0, diff_1.diffLines)(oldStr, newStr, { context_lines: Infinity });
    // If no changes, return minimal patch
    const hasChanges = diff.hunks.some((h) => h.op !== 'equal');
    if (!hasChanges) {
        return `--- ${oldFile}\n+++ ${newFile}\n`;
    }
    // Build patch hunks
    const patchHunks = [];
    let currentHunk = [];
    let hunkOldStart = 0;
    let hunkNewStart = 0;
    let hunkOldCount = 0;
    let hunkNewCount = 0;
    let oldPos = 0;
    let newPos = 0;
    let lastChangeIdx = -1;
    let contextStartIdx = -1;
    // Find all change indices
    const changeIndices = [];
    for (let i = 0; i < diff.hunks.length; i++) {
        if (diff.hunks[i].op !== 'equal') {
            changeIndices.push(i);
        }
    }
    if (changeIndices.length === 0) {
        return `--- ${oldFile}\n+++ ${newFile}\n`;
    }
    // Group changes into hunks
    const hunkGroups = [];
    let currentGroup = [];
    for (let i = 0; i < changeIndices.length; i++) {
        const ci = changeIndices[i];
        if (currentGroup.length === 0) {
            currentGroup.push(ci);
        }
        else {
            const lastCi = currentGroup[currentGroup.length - 1];
            // Check if this change is within context distance of the last
            if (ci - lastCi <= contextLines * 2 + 1) {
                currentGroup.push(ci);
            }
            else {
                hunkGroups.push(currentGroup);
                currentGroup = [ci];
            }
        }
    }
    if (currentGroup.length > 0) {
        hunkGroups.push(currentGroup);
    }
    // Build output
    let output = `--- ${oldFile}\n+++ ${newFile}\n`;
    for (const group of hunkGroups) {
        const firstChange = group[0];
        const lastChange = group[group.length - 1];
        // Calculate hunk boundaries with context
        const startIdx = Math.max(0, firstChange - contextLines);
        const endIdx = Math.min(diff.hunks.length - 1, lastChange + contextLines);
        // Calculate line numbers
        let hunkOldStart = 1;
        let hunkNewStart = 1;
        let hunkOldCount = 0;
        let hunkNewCount = 0;
        // Count positions up to startIdx
        for (let i = 0; i < startIdx; i++) {
            const h = diff.hunks[i];
            if (h.op === 'equal') {
                hunkOldStart++;
                hunkNewStart++;
            }
            else if (h.op === 'delete') {
                hunkOldStart++;
            }
            else if (h.op === 'insert') {
                hunkNewStart++;
            }
        }
        // Build hunk lines
        const hunkLines = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const h = diff.hunks[i];
            if (h.op === 'equal') {
                hunkLines.push(' ' + h.content);
                hunkOldCount++;
                hunkNewCount++;
            }
            else if (h.op === 'delete') {
                hunkLines.push('-' + h.content);
                hunkOldCount++;
            }
            else if (h.op === 'insert') {
                hunkLines.push('+' + h.content);
                hunkNewCount++;
            }
        }
        // Build hunk header
        const hunkHeader = `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`;
        output += hunkHeader + '\n';
        output += hunkLines.join('\n') + '\n';
    }
    return output;
}
/**
 * Apply a unified diff patch to content.
 */
function applyPatch(content, patch) {
    const errors = [];
    try {
        const parsed = parsePatch(patch);
        const lines = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(content));
        if (parsed.hunks.length === 0) {
            return {
                content,
                success: true,
                hunks_applied: 0,
                hunks_failed: 0,
                errors: [],
            };
        }
        let result = [...lines];
        let offset = 0;
        let hunksApplied = 0;
        let hunksFailed = 0;
        for (const hunk of parsed.hunks) {
            const applied = applyHunk(result, hunk, offset);
            if (applied.success) {
                result = applied.lines;
                offset += applied.offset;
                hunksApplied++;
            }
            else {
                hunksFailed++;
                errors.push(`Hunk at line ${hunk.old_start} failed to apply`);
            }
        }
        const resultContent = result.length > 0 ? result.join('\n') + '\n' : '';
        return {
            content: resultContent,
            success: hunksFailed === 0,
            hunks_applied: hunksApplied,
            hunks_failed: hunksFailed,
            errors,
        };
    }
    catch (e) {
        return {
            content,
            success: false,
            hunks_applied: 0,
            hunks_failed: 1,
            errors: [e instanceof Error ? e.message : 'Unknown error'],
        };
    }
}
function applyHunk(lines, hunk, offset) {
    const startLine = hunk.old_start - 1 + offset;
    // Extract expected old lines and new lines from hunk
    const expectedOld = [];
    const newLines = [];
    for (const line of hunk.lines) {
        if (line.op === ' ' || line.op === '-') {
            expectedOld.push(line.content);
        }
        if (line.op === ' ' || line.op === '+') {
            newLines.push(line.content);
        }
    }
    // Verify old content matches
    if (startLine < 0) {
        return { success: false, lines, offset: 0 };
    }
    // Try to find matching context with some fuzz
    let matchStart = -1;
    const fuzzRange = 3;
    for (let tryStart = Math.max(0, startLine - fuzzRange); tryStart <= Math.min(lines.length - expectedOld.length, startLine + fuzzRange); tryStart++) {
        if (tryStart < 0 || tryStart + expectedOld.length > lines.length)
            continue;
        let matches = true;
        for (let i = 0; i < expectedOld.length; i++) {
            if (lines[tryStart + i] !== expectedOld[i]) {
                matches = false;
                break;
            }
        }
        if (matches) {
            matchStart = tryStart;
            break;
        }
    }
    // Handle empty old (pure addition at beginning)
    if (expectedOld.length === 0 && newLines.length > 0) {
        const insertPos = Math.max(0, Math.min(startLine, lines.length));
        const result = [
            ...lines.slice(0, insertPos),
            ...newLines,
            ...lines.slice(insertPos),
        ];
        return {
            success: true,
            lines: result,
            offset: offset + newLines.length,
        };
    }
    if (matchStart === -1) {
        return { success: false, lines, offset: 0 };
    }
    // Apply the hunk
    const result = [
        ...lines.slice(0, matchStart),
        ...newLines,
        ...lines.slice(matchStart + expectedOld.length),
    ];
    const offsetChange = newLines.length - expectedOld.length;
    return {
        success: true,
        lines: result,
        offset: offset + offsetChange,
    };
}
/**
 * Reverse a patch (swap additions and deletions).
 */
function reversePatch(patch) {
    const lines = patch.split('\n');
    const result = [];
    let inHunk = false;
    let hunkOldStart = 0;
    let hunkOldCount = 0;
    let hunkNewStart = 0;
    let hunkNewCount = 0;
    for (const line of lines) {
        if (line.startsWith('--- ')) {
            // Swap old/new file headers
            result.push('+++ ' + line.slice(4));
        }
        else if (line.startsWith('+++ ')) {
            result.push('--- ' + line.slice(4));
        }
        else if (line.startsWith('@@')) {
            // Parse and swap hunk header
            const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
            if (match) {
                const oldStart = match[1];
                const oldCount = match[2] || '1';
                const newStart = match[3];
                const newCount = match[4] || '1';
                const rest = match[5] || '';
                result.push(`@@ -${newStart},${newCount} +${oldStart},${oldCount} @@${rest}`);
            }
            else {
                result.push(line);
            }
            inHunk = true;
        }
        else if (inHunk && line.startsWith('+')) {
            result.push('-' + line.slice(1));
        }
        else if (inHunk && line.startsWith('-')) {
            result.push('+' + line.slice(1));
        }
        else {
            result.push(line);
        }
    }
    return result.join('\n');
}
/**
 * Parse unified diff format into structured data.
 */
function parsePatch(patch) {
    const lines = patch.split('\n');
    let oldFile = '';
    let newFile = '';
    const hunks = [];
    let currentHunk = null;
    let lineIdx = 0;
    while (lineIdx < lines.length) {
        const line = lines[lineIdx];
        if (line.startsWith('--- ')) {
            oldFile = line.slice(4);
        }
        else if (line.startsWith('+++ ')) {
            newFile = line.slice(4);
        }
        else if (line.startsWith('@@')) {
            // Parse hunk header
            const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
            if (!match) {
                throw new types_1.ParseError(`Invalid hunk header: ${line}`);
            }
            if (currentHunk) {
                hunks.push(currentHunk);
            }
            currentHunk = {
                old_start: parseInt(match[1], 10),
                old_count: match[2] ? parseInt(match[2], 10) : 1,
                new_start: parseInt(match[3], 10),
                new_count: match[4] ? parseInt(match[4], 10) : 1,
                lines: [],
            };
        }
        else if (currentHunk) {
            if (line.startsWith(' ')) {
                currentHunk.lines.push({ op: ' ', content: line.slice(1) });
            }
            else if (line.startsWith('+')) {
                currentHunk.lines.push({ op: '+', content: line.slice(1) });
            }
            else if (line.startsWith('-')) {
                currentHunk.lines.push({ op: '-', content: line.slice(1) });
            }
            else if (line === '' && lineIdx === lines.length - 1) {
                // Skip trailing empty line
            }
            else if (line.startsWith('\\')) {
                // Skip "\ No newline at end of file" markers
            }
        }
        lineIdx++;
    }
    if (currentHunk) {
        hunks.push(currentHunk);
    }
    // Validate that we parsed something
    if (!oldFile && !newFile && hunks.length === 0) {
        throw new types_1.ParseError('Invalid patch format');
    }
    return { old_file: oldFile, new_file: newFile, hunks };
}
