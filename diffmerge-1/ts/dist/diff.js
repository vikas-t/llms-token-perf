"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffLines = diffLines;
exports.diffWords = diffWords;
exports.diffChars = diffChars;
const utils_1 = require("./utils");
/**
 * Compute the Longest Common Subsequence between two arrays.
 * Returns an array of indices pairs [oldIndex, newIndex] for matching elements.
 */
function computeLCS(oldArr, newArr, equals) {
    const m = oldArr.length;
    const n = newArr.length;
    // Build the LCS table
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (equals(oldArr[i - 1], newArr[j - 1])) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack to find the LCS
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (equals(oldArr[i - 1], newArr[j - 1])) {
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
 * Compute line-by-line diff using LCS algorithm.
 */
function diffLines(oldText, newText, options = {}) {
    const ignoreWhitespace = options.ignore_whitespace ?? false;
    const ignoreBlankLines = options.ignore_blank_lines ?? false;
    const contextLines = options.context_lines ?? 3;
    // Normalize line endings
    const normalizedOld = (0, utils_1.normalizeLineEndings)(oldText);
    const normalizedNew = (0, utils_1.normalizeLineEndings)(newText);
    // Split into lines
    let oldLines = (0, utils_1.splitLines)(normalizedOld);
    let newLines = (0, utils_1.splitLines)(normalizedNew);
    // If ignoring blank lines, filter them out but keep track of original indices
    let oldLineIndices = oldLines.map((_, i) => i);
    let newLineIndices = newLines.map((_, i) => i);
    if (ignoreBlankLines) {
        const filteredOld = [];
        const filteredOldIndices = [];
        oldLines.forEach((line, i) => {
            if (line.trim() !== "") {
                filteredOld.push(line);
                filteredOldIndices.push(i);
            }
        });
        const filteredNew = [];
        const filteredNewIndices = [];
        newLines.forEach((line, i) => {
            if (line.trim() !== "") {
                filteredNew.push(line);
                filteredNewIndices.push(i);
            }
        });
        // If all lines are blank or after filtering everything matches
        if (filteredOld.length === 0 && filteredNew.length === 0) {
            return {
                hunks: oldLines.map((line, i) => ({
                    op: "equal",
                    content: line,
                    old_start: i + 1,
                    new_start: i + 1,
                    old_count: 1,
                    new_count: 1,
                })),
                stats: { additions: 0, deletions: 0, changes: 0 },
            };
        }
        oldLines = filteredOld;
        newLines = filteredNew;
        oldLineIndices = filteredOldIndices;
        newLineIndices = filteredNewIndices;
    }
    // Comparison function considering whitespace option
    const equals = (a, b) => {
        if (ignoreWhitespace) {
            return a.trim() === b.trim();
        }
        return a === b;
    };
    // Compute LCS
    const lcs = computeLCS(oldLines, newLines, equals);
    // Build hunks from LCS
    const hunks = [];
    let oldIdx = 0;
    let newIdx = 0;
    let additions = 0;
    let deletions = 0;
    for (const [lcsOldIdx, lcsNewIdx] of lcs) {
        // Process deletions (lines in old but not in lcs before this match)
        while (oldIdx < lcsOldIdx) {
            hunks.push({
                op: "delete",
                content: oldLines[oldIdx],
                old_start: oldLineIndices[oldIdx] + 1,
                old_count: 1,
            });
            deletions++;
            oldIdx++;
        }
        // Process insertions (lines in new but not in lcs before this match)
        while (newIdx < lcsNewIdx) {
            hunks.push({
                op: "insert",
                content: newLines[newIdx],
                new_start: newLineIndices[newIdx] + 1,
                new_count: 1,
            });
            additions++;
            newIdx++;
        }
        // Process equal line
        hunks.push({
            op: "equal",
            content: oldLines[oldIdx],
            old_start: oldLineIndices[oldIdx] + 1,
            new_start: newLineIndices[newIdx] + 1,
            old_count: 1,
            new_count: 1,
        });
        oldIdx++;
        newIdx++;
    }
    // Process remaining deletions
    while (oldIdx < oldLines.length) {
        hunks.push({
            op: "delete",
            content: oldLines[oldIdx],
            old_start: oldLineIndices[oldIdx] + 1,
            old_count: 1,
        });
        deletions++;
        oldIdx++;
    }
    // Process remaining insertions
    while (newIdx < newLines.length) {
        hunks.push({
            op: "insert",
            content: newLines[newIdx],
            new_start: newLineIndices[newIdx] + 1,
            new_count: 1,
        });
        additions++;
        newIdx++;
    }
    // Apply context filtering if needed
    const filteredHunks = applyContextFilter(hunks, contextLines);
    return {
        hunks: filteredHunks,
        stats: {
            additions,
            deletions,
            changes: Math.min(additions, deletions),
        },
    };
}
/**
 * Apply context filtering to hunks.
 * Only include equal lines that are within contextLines of a change.
 */
function applyContextFilter(hunks, contextLines) {
    if (hunks.length === 0)
        return hunks;
    // Find indices of change hunks (delete or insert)
    const changeIndices = [];
    hunks.forEach((h, i) => {
        if (h.op !== "equal") {
            changeIndices.push(i);
        }
    });
    // If no changes, return appropriate hunks
    if (changeIndices.length === 0) {
        return hunks;
    }
    // Mark which equal hunks should be included
    const includeHunk = hunks.map((h) => h.op !== "equal");
    for (const changeIdx of changeIndices) {
        // Include contextLines before
        for (let i = changeIdx - 1; i >= 0 && i >= changeIdx - contextLines; i--) {
            if (hunks[i].op === "equal") {
                includeHunk[i] = true;
            }
        }
        // Include contextLines after
        for (let i = changeIdx + 1; i < hunks.length && i <= changeIdx + contextLines; i++) {
            if (hunks[i].op === "equal") {
                includeHunk[i] = true;
            }
        }
    }
    return hunks.filter((_, i) => includeHunk[i]);
}
/**
 * Compute word-by-word diff within text.
 */
function diffWords(oldText, newText) {
    // Tokenize into words and whitespace
    const oldTokens = tokenizeWords(oldText);
    const newTokens = tokenizeWords(newText);
    // Compute LCS on tokens
    const lcs = computeLCS(oldTokens, newTokens, (a, b) => a === b);
    // Build hunks
    const hunks = [];
    let oldIdx = 0;
    let newIdx = 0;
    for (const [lcsOldIdx, lcsNewIdx] of lcs) {
        // Deletions
        if (oldIdx < lcsOldIdx) {
            hunks.push({
                op: "delete",
                content: oldTokens.slice(oldIdx, lcsOldIdx).join(""),
            });
        }
        // Insertions
        if (newIdx < lcsNewIdx) {
            hunks.push({
                op: "insert",
                content: newTokens.slice(newIdx, lcsNewIdx).join(""),
            });
        }
        // Equal
        hunks.push({
            op: "equal",
            content: oldTokens[lcsOldIdx],
        });
        oldIdx = lcsOldIdx + 1;
        newIdx = lcsNewIdx + 1;
    }
    // Remaining deletions
    if (oldIdx < oldTokens.length) {
        hunks.push({
            op: "delete",
            content: oldTokens.slice(oldIdx).join(""),
        });
    }
    // Remaining insertions
    if (newIdx < newTokens.length) {
        hunks.push({
            op: "insert",
            content: newTokens.slice(newIdx).join(""),
        });
    }
    // Merge consecutive equal hunks
    return mergeConsecutiveHunks(hunks);
}
/**
 * Tokenize text into words and whitespace.
 */
function tokenizeWords(text) {
    const tokens = [];
    const regex = /(\s+|\S+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.push(match[0]);
    }
    return tokens;
}
/**
 * Compute character-by-character diff.
 */
function diffChars(oldText, newText) {
    const oldChars = Array.from(oldText);
    const newChars = Array.from(newText);
    // Compute LCS on characters
    const lcs = computeLCS(oldChars, newChars, (a, b) => a === b);
    // Build hunks
    const hunks = [];
    let oldIdx = 0;
    let newIdx = 0;
    for (const [lcsOldIdx, lcsNewIdx] of lcs) {
        // Deletions
        if (oldIdx < lcsOldIdx) {
            hunks.push({
                op: "delete",
                content: oldChars.slice(oldIdx, lcsOldIdx).join(""),
            });
        }
        // Insertions
        if (newIdx < lcsNewIdx) {
            hunks.push({
                op: "insert",
                content: newChars.slice(newIdx, lcsNewIdx).join(""),
            });
        }
        // Equal
        hunks.push({
            op: "equal",
            content: oldChars[lcsOldIdx],
        });
        oldIdx = lcsOldIdx + 1;
        newIdx = lcsNewIdx + 1;
    }
    // Remaining deletions
    if (oldIdx < oldChars.length) {
        hunks.push({
            op: "delete",
            content: oldChars.slice(oldIdx).join(""),
        });
    }
    // Remaining insertions
    if (newIdx < newChars.length) {
        hunks.push({
            op: "insert",
            content: newChars.slice(newIdx).join(""),
        });
    }
    // Merge consecutive hunks of the same type
    return mergeConsecutiveHunks(hunks);
}
/**
 * Merge consecutive hunks of the same type.
 */
function mergeConsecutiveHunks(hunks) {
    if (hunks.length === 0)
        return hunks;
    const merged = [];
    let current = { ...hunks[0] };
    for (let i = 1; i < hunks.length; i++) {
        if (hunks[i].op === current.op) {
            current.content += hunks[i].content;
        }
        else {
            merged.push(current);
            current = { ...hunks[i] };
        }
    }
    merged.push(current);
    return merged;
}
