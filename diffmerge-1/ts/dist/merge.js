"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge3 = merge3;
exports.hasConflicts = hasConflicts;
exports.extractConflicts = extractConflicts;
exports.resolveConflict = resolveConflict;
const utils_1 = require("./utils");
/**
 * Compute the Longest Common Subsequence between two arrays.
 */
function computeLCS(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (arr1[i - 1] === arr2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (arr1[i - 1] === arr2[j - 1]) {
            lcs.unshift([i - 1, j - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return lcs;
}
/**
 * Compute diff blocks between base and other.
 */
function computeDiffBlocks(base, other) {
    const lcs = computeLCS(base, other);
    const blocks = [];
    let baseIdx = 0;
    let otherIdx = 0;
    for (const [lcsBaseIdx, lcsOtherIdx] of lcs) {
        // If there's a gap before this LCS point, it's a change
        if (baseIdx < lcsBaseIdx || otherIdx < lcsOtherIdx) {
            blocks.push({
                type: "change",
                baseStart: baseIdx,
                baseEnd: lcsBaseIdx,
                otherStart: otherIdx,
                otherEnd: lcsOtherIdx,
            });
        }
        // The LCS match is an equal block
        blocks.push({
            type: "equal",
            baseStart: lcsBaseIdx,
            baseEnd: lcsBaseIdx + 1,
            otherStart: lcsOtherIdx,
            otherEnd: lcsOtherIdx + 1,
        });
        baseIdx = lcsBaseIdx + 1;
        otherIdx = lcsOtherIdx + 1;
    }
    // Handle remaining content after last LCS match
    if (baseIdx < base.length || otherIdx < other.length) {
        blocks.push({
            type: "change",
            baseStart: baseIdx,
            baseEnd: base.length,
            otherStart: otherIdx,
            otherEnd: other.length,
        });
    }
    return blocks;
}
/**
 * Merge consecutive equal blocks.
 */
function mergeEqualBlocks(blocks) {
    if (blocks.length === 0)
        return blocks;
    const result = [];
    let current = { ...blocks[0] };
    for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        if (current.type === "equal" && b.type === "equal" &&
            current.baseEnd === b.baseStart && current.otherEnd === b.otherStart) {
            current.baseEnd = b.baseEnd;
            current.otherEnd = b.otherEnd;
        }
        else {
            result.push(current);
            current = { ...b };
        }
    }
    result.push(current);
    return result;
}
/**
 * Three-way merge with conflict detection.
 */
function merge3(baseText, oursText, theirsText, options = {}) {
    const conflictStyle = options.conflict_style ?? "merge";
    const oursLabel = options.ours_label ?? "ours";
    const theirsLabel = options.theirs_label ?? "theirs";
    const baseLabel = options.base_label ?? "base";
    // Normalize line endings
    const base = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(baseText));
    const ours = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(oursText));
    const theirs = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(theirsText));
    // Get diff blocks from base to ours and base to theirs
    const oursBlocks = mergeEqualBlocks(computeDiffBlocks(base, ours));
    const theirsBlocks = mergeEqualBlocks(computeDiffBlocks(base, theirs));
    const oursLineState = new Array(base.length).fill(null);
    const theirsLineState = new Array(base.length).fill(null);
    // Also track insertions at positions (before base line index)
    const oursInsertions = new Map();
    const theirsInsertions = new Map();
    // Process ours blocks
    for (const block of oursBlocks) {
        if (block.type === "equal") {
            for (let i = block.baseStart; i < block.baseEnd; i++) {
                oursLineState[i] = { type: "unchanged" };
            }
        }
        else {
            // Change block
            const baseLines = block.baseEnd - block.baseStart;
            const oursLines = block.otherEnd - block.otherStart;
            const replacement = ours.slice(block.otherStart, block.otherEnd);
            if (baseLines === 0) {
                // Pure insertion
                oursInsertions.set(block.baseStart, replacement);
            }
            else if (oursLines === 0) {
                // Pure deletion
                for (let i = block.baseStart; i < block.baseEnd; i++) {
                    oursLineState[i] = { type: "deleted" };
                }
            }
            else {
                // Modification: treat first base line as changed, rest as deleted
                oursLineState[block.baseStart] = { type: "changed", replacement };
                for (let i = block.baseStart + 1; i < block.baseEnd; i++) {
                    oursLineState[i] = { type: "deleted" };
                }
            }
        }
    }
    // Process theirs blocks
    for (const block of theirsBlocks) {
        if (block.type === "equal") {
            for (let i = block.baseStart; i < block.baseEnd; i++) {
                theirsLineState[i] = { type: "unchanged" };
            }
        }
        else {
            const baseLines = block.baseEnd - block.baseStart;
            const theirsLines = block.otherEnd - block.otherStart;
            const replacement = theirs.slice(block.otherStart, block.otherEnd);
            if (baseLines === 0) {
                theirsInsertions.set(block.baseStart, replacement);
            }
            else if (theirsLines === 0) {
                for (let i = block.baseStart; i < block.baseEnd; i++) {
                    theirsLineState[i] = { type: "deleted" };
                }
            }
            else {
                theirsLineState[block.baseStart] = { type: "changed", replacement };
                for (let i = block.baseStart + 1; i < block.baseEnd; i++) {
                    theirsLineState[i] = { type: "deleted" };
                }
            }
        }
    }
    // Now merge
    const result = [];
    const conflicts = [];
    let lineNumber = 1;
    for (let i = 0; i <= base.length; i++) {
        // Handle insertions before this position
        const oursIns = oursInsertions.get(i) || [];
        const theirsIns = theirsInsertions.get(i) || [];
        if (oursIns.length > 0 || theirsIns.length > 0) {
            if (oursIns.length > 0 && theirsIns.length > 0) {
                if (arraysEqual(oursIns, theirsIns)) {
                    // Same insertion - no conflict
                    result.push(...oursIns);
                    lineNumber += oursIns.length;
                }
                else {
                    // Conflict - different insertions at same point
                    const startLine = lineNumber;
                    result.push(`<<<<<<< ${oursLabel}`);
                    result.push(...oursIns);
                    if (conflictStyle === "diff3") {
                        result.push(`||||||| ${baseLabel}`);
                    }
                    result.push("=======");
                    result.push(...theirsIns);
                    result.push(`>>>>>>> ${theirsLabel}`);
                    const endLine = lineNumber + 3 + oursIns.length + theirsIns.length + (conflictStyle === "diff3" ? 1 : 0);
                    lineNumber = endLine;
                    conflicts.push({
                        base: "",
                        ours: oursIns.join("\n") + (oursIns.length > 0 ? "\n" : ""),
                        theirs: theirsIns.join("\n") + (theirsIns.length > 0 ? "\n" : ""),
                        start_line: startLine,
                        end_line: endLine - 1,
                    });
                }
            }
            else if (oursIns.length > 0) {
                result.push(...oursIns);
                lineNumber += oursIns.length;
            }
            else {
                result.push(...theirsIns);
                lineNumber += theirsIns.length;
            }
        }
        if (i >= base.length)
            break;
        // Handle base line i
        const oursState = oursLineState[i] || { type: "unchanged" };
        const theirsState = theirsLineState[i] || { type: "unchanged" };
        if (oursState.type === "unchanged" && theirsState.type === "unchanged") {
            // Both unchanged - keep base
            result.push(base[i]);
            lineNumber++;
        }
        else if (oursState.type === "unchanged") {
            // Only theirs changed
            if (theirsState.type === "deleted") {
                // theirs deleted, ours kept - take ours (base)
                // But wait, if theirs deleted and ours unchanged, we should take theirs (deleted)
                // No, if one side deletes and other keeps, take the deletion (or conflict?)
                // Actually, standard merge: if one side unchanged from base and other modified, take modified
                // So we skip (delete)
            }
            else if (theirsState.type === "changed") {
                // theirs modified, ours unchanged - take theirs
                result.push(...theirsState.replacement);
                lineNumber += theirsState.replacement.length;
            }
        }
        else if (theirsState.type === "unchanged") {
            // Only ours changed
            if (oursState.type === "deleted") {
                // ours deleted, theirs kept - take ours (deleted = skip)
            }
            else if (oursState.type === "changed") {
                // ours modified, theirs unchanged - take ours
                result.push(...oursState.replacement);
                lineNumber += oursState.replacement.length;
            }
        }
        else {
            // Both changed from base
            const oursDeleted = oursState.type === "deleted";
            const theirsDeleted = theirsState.type === "deleted";
            const oursReplacement = oursState.type === "changed" ? oursState.replacement : [];
            const theirsReplacement = theirsState.type === "changed" ? theirsState.replacement : [];
            if (oursDeleted && theirsDeleted) {
                // Both deleted - skip
            }
            else if (arraysEqual(oursReplacement, theirsReplacement)) {
                // Both made same change - no conflict
                if (oursReplacement.length > 0) {
                    result.push(...oursReplacement);
                    lineNumber += oursReplacement.length;
                }
            }
            else {
                // Conflict: different changes
                const startLine = lineNumber;
                result.push(`<<<<<<< ${oursLabel}`);
                result.push(...oursReplacement);
                if (conflictStyle === "diff3") {
                    result.push(`||||||| ${baseLabel}`);
                    result.push(base[i]);
                }
                result.push("=======");
                result.push(...theirsReplacement);
                result.push(`>>>>>>> ${theirsLabel}`);
                const conflictLines = 4 + oursReplacement.length + theirsReplacement.length +
                    (conflictStyle === "diff3" ? 2 : 0);
                lineNumber += conflictLines;
                conflicts.push({
                    base: base[i] + "\n",
                    ours: oursReplacement.join("\n") + (oursReplacement.length > 0 ? "\n" : ""),
                    theirs: theirsReplacement.join("\n") + (theirsReplacement.length > 0 ? "\n" : ""),
                    start_line: startLine,
                    end_line: startLine + conflictLines - 1,
                });
            }
        }
    }
    let content = result.join("\n");
    if (result.length > 0) {
        content += "\n";
    }
    return {
        content,
        has_conflicts: conflicts.length > 0,
        conflicts,
    };
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}
/**
 * Check if content contains conflict markers.
 */
function hasConflicts(content) {
    return (content.includes("<<<<<<<") &&
        content.includes("=======") &&
        content.includes(">>>>>>>"));
}
/**
 * Extract conflict regions from merged content.
 */
function extractConflicts(content) {
    const conflicts = [];
    const lines = content.split("\n");
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith("<<<<<<<")) {
            const startLine = i + 1;
            // Find ours content
            const oursLines = [];
            i++;
            const baseLines = [];
            while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) {
                oursLines.push(lines[i]);
                i++;
            }
            // Check for diff3 style base
            if (i < lines.length && lines[i].startsWith("|||||||")) {
                i++;
                while (i < lines.length && !lines[i].startsWith("=======")) {
                    baseLines.push(lines[i]);
                    i++;
                }
            }
            // Skip separator
            if (i < lines.length && lines[i].startsWith("=======")) {
                i++;
            }
            // Find theirs content
            const theirsLines = [];
            while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
                theirsLines.push(lines[i]);
                i++;
            }
            const endLine = i + 1;
            // Skip closing marker
            if (i < lines.length && lines[i].startsWith(">>>>>>>")) {
                i++;
            }
            conflicts.push({
                base: baseLines.join("\n") + (baseLines.length > 0 ? "\n" : ""),
                ours: oursLines.join("\n") + (oursLines.length > 0 ? "\n" : ""),
                theirs: theirsLines.join("\n") + (theirsLines.length > 0 ? "\n" : ""),
                start_line: startLine,
                end_line: endLine,
            });
        }
        else {
            i++;
        }
    }
    return conflicts;
}
/**
 * Resolve a specific conflict in the content.
 */
function resolveConflict(content, conflictIndex, resolution) {
    const lines = content.split("\n");
    const result = [];
    let currentConflict = 0;
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith("<<<<<<<")) {
            if (currentConflict === conflictIndex) {
                // Resolve this conflict
                const oursLines = [];
                const baseLines = [];
                const theirsLines = [];
                i++;
                // Read ours
                while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) {
                    oursLines.push(lines[i]);
                    i++;
                }
                // Check for base
                if (i < lines.length && lines[i].startsWith("|||||||")) {
                    i++;
                    while (i < lines.length && !lines[i].startsWith("=======")) {
                        baseLines.push(lines[i]);
                        i++;
                    }
                }
                // Skip separator
                if (i < lines.length && lines[i].startsWith("=======")) {
                    i++;
                }
                // Read theirs
                while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
                    theirsLines.push(lines[i]);
                    i++;
                }
                // Skip closing marker
                if (i < lines.length && lines[i].startsWith(">>>>>>>")) {
                    i++;
                }
                // Apply resolution
                let resolvedLines;
                if (resolution === "ours") {
                    resolvedLines = oursLines;
                }
                else if (resolution === "theirs") {
                    resolvedLines = theirsLines;
                }
                else if (resolution === "base") {
                    resolvedLines = baseLines;
                }
                else {
                    // Custom resolution - treat as content
                    resolvedLines = resolution.split("\n");
                    // Remove trailing empty string if resolution ends with newline
                    if (resolvedLines[resolvedLines.length - 1] === "") {
                        resolvedLines.pop();
                    }
                }
                result.push(...resolvedLines);
                currentConflict++;
            }
            else {
                // Keep this conflict as-is
                result.push(lines[i]);
                i++;
                while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
                    result.push(lines[i]);
                    i++;
                }
                if (i < lines.length) {
                    result.push(lines[i]);
                    i++;
                }
                currentConflict++;
            }
        }
        else {
            result.push(lines[i]);
            i++;
        }
    }
    return result.join("\n");
}
