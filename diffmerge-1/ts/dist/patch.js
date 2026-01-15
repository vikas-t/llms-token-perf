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
function createPatch(oldText, newText, options = {}) {
    const oldFile = options.old_file ?? "a";
    const newFile = options.new_file ?? "b";
    const contextLines = options.context_lines ?? 3;
    // Normalize line endings
    const normalizedOld = (0, utils_1.normalizeLineEndings)(oldText);
    const normalizedNew = (0, utils_1.normalizeLineEndings)(newText);
    const oldLines = (0, utils_1.splitLines)(normalizedOld);
    const newLines = (0, utils_1.splitLines)(normalizedNew);
    // Get the diff
    const diff = (0, diff_1.diffLines)(normalizedOld, normalizedNew, { context_lines: contextLines });
    // If no changes, return minimal patch
    const hasChanges = diff.hunks.some((h) => h.op !== "equal");
    if (!hasChanges) {
        return `--- ${oldFile}\n+++ ${newFile}\n`;
    }
    // Group hunks into unified diff hunks
    const unifiedHunks = groupIntoUnifiedHunks(diff.hunks, oldLines, newLines, contextLines);
    // Build patch string
    let patch = `--- ${oldFile}\n+++ ${newFile}\n`;
    for (const hunk of unifiedHunks) {
        patch += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
        for (const line of hunk.lines) {
            patch += `${line.prefix}${line.content}\n`;
        }
    }
    return patch;
}
/**
 * Group diff hunks into unified diff format hunks.
 */
function groupIntoUnifiedHunks(hunks, oldLines, newLines, contextLines) {
    if (hunks.length === 0)
        return [];
    // Find change regions
    const changes = [];
    let inChange = false;
    let changeStart = 0;
    for (let i = 0; i < hunks.length; i++) {
        if (hunks[i].op !== "equal") {
            if (!inChange) {
                changeStart = i;
                inChange = true;
            }
        }
        else {
            if (inChange) {
                changes.push({ startIdx: changeStart, endIdx: i - 1 });
                inChange = false;
            }
        }
    }
    if (inChange) {
        changes.push({ startIdx: changeStart, endIdx: hunks.length - 1 });
    }
    // Merge nearby change regions
    const mergedChanges = [];
    for (const change of changes) {
        if (mergedChanges.length === 0) {
            mergedChanges.push(change);
        }
        else {
            const last = mergedChanges[mergedChanges.length - 1];
            // If gap is small enough, merge
            if (change.startIdx - last.endIdx <= 2 * contextLines + 1) {
                last.endIdx = change.endIdx;
            }
            else {
                mergedChanges.push(change);
            }
        }
    }
    // Build unified hunks
    const result = [];
    for (const change of mergedChanges) {
        // Calculate context range
        let hunkStartIdx = Math.max(0, change.startIdx - contextLines);
        let hunkEndIdx = Math.min(hunks.length - 1, change.endIdx + contextLines);
        // Find the context boundaries ensuring we get equal lines for context
        while (hunkStartIdx > 0 && hunks[hunkStartIdx].op !== "equal") {
            hunkStartIdx--;
        }
        // Adjust back to ensure we have enough context
        const contextBefore = change.startIdx - hunkStartIdx;
        if (contextBefore < contextLines && hunkStartIdx > 0) {
            hunkStartIdx = Math.max(0, change.startIdx - contextLines);
        }
        // Build lines for this hunk
        const hunkLines = [];
        let oldCount = 0;
        let newCount = 0;
        let oldStart = 0;
        let newStart = 0;
        let foundFirst = false;
        for (let i = hunkStartIdx; i <= hunkEndIdx; i++) {
            const h = hunks[i];
            if (h.op === "equal") {
                if (!foundFirst) {
                    oldStart = h.old_start || 1;
                    newStart = h.new_start || 1;
                    foundFirst = true;
                }
                hunkLines.push({ prefix: " ", content: h.content });
                oldCount++;
                newCount++;
            }
            else if (h.op === "delete") {
                if (!foundFirst) {
                    oldStart = h.old_start || 1;
                    newStart = oldStart;
                    foundFirst = true;
                }
                hunkLines.push({ prefix: "-", content: h.content });
                oldCount++;
            }
            else if (h.op === "insert") {
                if (!foundFirst) {
                    newStart = h.new_start || 1;
                    oldStart = newStart;
                    foundFirst = true;
                }
                hunkLines.push({ prefix: "+", content: h.content });
                newCount++;
            }
        }
        // Handle empty case
        if (!foundFirst) {
            oldStart = 1;
            newStart = 1;
        }
        result.push({
            oldStart,
            oldCount,
            newStart,
            newCount,
            lines: hunkLines,
        });
    }
    return result;
}
/**
 * Apply a unified diff patch to content.
 */
function applyPatch(content, patch) {
    const errors = [];
    // Parse the patch
    let parsed;
    try {
        parsed = parsePatch(patch);
    }
    catch (e) {
        return {
            content,
            success: false,
            hunks_applied: 0,
            hunks_failed: 1,
            errors: [e.message],
        };
    }
    // If no hunks, return content unchanged
    if (parsed.hunks.length === 0) {
        return {
            content,
            success: true,
            hunks_applied: 0,
            hunks_failed: 0,
            errors: [],
        };
    }
    // Normalize and split content
    const normalizedContent = (0, utils_1.normalizeLineEndings)(content);
    const lines = (0, utils_1.splitLines)(normalizedContent);
    let hunksApplied = 0;
    let hunksFailed = 0;
    // Apply hunks in reverse order to avoid line number shifts
    const sortedHunks = [...parsed.hunks].sort((a, b) => b.old_start - a.old_start);
    for (const hunk of sortedHunks) {
        const result = applyHunk(lines, hunk);
        if (result.success) {
            hunksApplied++;
        }
        else {
            hunksFailed++;
            errors.push(result.error || "Unknown error");
        }
    }
    // Reconstruct content
    let resultContent = lines.join("\n");
    if (lines.length > 0) {
        resultContent += "\n";
    }
    return {
        content: resultContent,
        success: hunksFailed === 0,
        hunks_applied: hunksApplied,
        hunks_failed: hunksFailed,
        errors,
    };
}
/**
 * Apply a single hunk to lines array (modifies in place).
 */
function applyHunk(lines, hunk) {
    // Find the right position to apply the hunk
    const startIdx = hunk.old_start - 1;
    // Get the expected context/deletions from the hunk
    const expectedLines = [];
    for (const line of hunk.lines) {
        if (line.op === " " || line.op === "-") {
            expectedLines.push(line.content);
        }
    }
    // Try to find a match with fuzz
    let matchIdx = -1;
    for (let offset = 0; offset <= Math.min(lines.length, 10); offset++) {
        // Try at exact position first
        if (offset === 0 && matchAtPosition(lines, expectedLines, startIdx)) {
            matchIdx = startIdx;
            break;
        }
        // Try above
        if (startIdx - offset >= 0 && matchAtPosition(lines, expectedLines, startIdx - offset)) {
            matchIdx = startIdx - offset;
            break;
        }
        // Try below
        if (startIdx + offset < lines.length && matchAtPosition(lines, expectedLines, startIdx + offset)) {
            matchIdx = startIdx + offset;
            break;
        }
    }
    if (matchIdx === -1) {
        return {
            success: false,
            error: `Hunk at line ${hunk.old_start} does not match`,
        };
    }
    // Apply the hunk
    const newLines = [];
    for (const line of hunk.lines) {
        if (line.op === " " || line.op === "+") {
            newLines.push(line.content);
        }
    }
    // Replace the old lines with new lines
    lines.splice(matchIdx, expectedLines.length, ...newLines);
    return { success: true };
}
/**
 * Check if expected lines match at a given position.
 */
function matchAtPosition(lines, expected, pos) {
    if (pos < 0 || pos + expected.length > lines.length) {
        // Special case: applying to empty content with additions only
        if (expected.length === 0 && pos === 0) {
            return true;
        }
        return false;
    }
    for (let i = 0; i < expected.length; i++) {
        if (lines[pos + i] !== expected[i]) {
            return false;
        }
    }
    return true;
}
/**
 * Reverse a patch (swap additions and deletions).
 */
function reversePatch(patch) {
    const lines = patch.split("\n");
    const result = [];
    let inHunk = false;
    let currentHunk = null;
    for (const line of lines) {
        if (line.startsWith("--- ")) {
            // Swap file names
            const newFile = line.replace("--- ", "+++ ");
            result.push(newFile.replace("+++ ", "--- "));
        }
        else if (line.startsWith("+++ ")) {
            // Already handled above, skip
            result.push(line.replace("+++ ", "--- "));
        }
        else if (line.startsWith("@@")) {
            // Parse and swap hunk header
            const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
            if (match) {
                const oldStart = parseInt(match[1]);
                const oldCount = match[2] ? parseInt(match[2]) : 1;
                const newStart = parseInt(match[3]);
                const newCount = match[4] ? parseInt(match[4]) : 1;
                // Swap old and new
                result.push(`@@ -${newStart},${newCount} +${oldStart},${oldCount} @@`);
            }
            else {
                result.push(line);
            }
            inHunk = true;
        }
        else if (inHunk) {
            if (line.startsWith("+")) {
                result.push("-" + line.substring(1));
            }
            else if (line.startsWith("-")) {
                result.push("+" + line.substring(1));
            }
            else {
                result.push(line);
            }
        }
        else {
            result.push(line);
        }
    }
    return result.join("\n");
}
/**
 * Parse unified diff format into structured data.
 */
function parsePatch(patch) {
    const lines = patch.split("\n");
    let oldFile = "";
    let newFile = "";
    const hunks = [];
    let currentHunk = null;
    let lineIdx = 0;
    while (lineIdx < lines.length) {
        const line = lines[lineIdx];
        if (line.startsWith("--- ")) {
            oldFile = line.substring(4).trim();
        }
        else if (line.startsWith("+++ ")) {
            newFile = line.substring(4).trim();
        }
        else if (line.startsWith("@@")) {
            // Parse hunk header
            const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
            if (!match) {
                throw new types_1.ParseError(`Invalid hunk header: ${line}`);
            }
            currentHunk = {
                old_start: parseInt(match[1]),
                old_count: match[2] ? parseInt(match[2]) : 1,
                new_start: parseInt(match[3]),
                new_count: match[4] ? parseInt(match[4]) : 1,
                lines: [],
            };
            hunks.push(currentHunk);
        }
        else if (currentHunk !== null) {
            if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
                const op = line[0];
                const content = line.substring(1);
                currentHunk.lines.push({ op, content });
            }
            else if (line === "") {
                // Empty line - could be end of hunk or actual empty context line
                // If we're in a hunk, treat empty line as context if we haven't met counts
                // Otherwise skip
            }
        }
        lineIdx++;
    }
    // Validate we got something
    if (hunks.length === 0 && patch.trim() !== "" && !patch.includes("--- ")) {
        throw new types_1.ParseError("Invalid patch format: no hunks found");
    }
    return { old_file: oldFile, new_file: newFile, hunks };
}
