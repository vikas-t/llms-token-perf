"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffLines = diffLines;
exports.diffWords = diffWords;
exports.diffChars = diffChars;
const utils_1 = require("./utils");
/**
 * Compute LCS (Longest Common Subsequence) using dynamic programming.
 * Returns the indices of matching elements in both arrays.
 */
function computeLCS(a, b) {
    const m = a.length;
    const n = b.length;
    // DP table
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
    // Fill the DP table
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack to find the LCS pairs
    const pairs = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            pairs.unshift([i - 1, j - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return pairs;
}
/**
 * Line-by-line diff using LCS algorithm.
 */
function diffLines(oldStr, newStr, options = {}) {
    const ignoreWhitespace = options.ignore_whitespace ?? false;
    const ignoreBlankLines = options.ignore_blank_lines ?? false;
    const contextLines = options.context_lines ?? 3;
    const oldLines = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(oldStr));
    const newLines = (0, utils_1.splitLines)((0, utils_1.normalizeLineEndings)(newStr));
    // Create comparison versions (for matching purposes)
    const oldCompare = oldLines.map((line) => ignoreWhitespace ? line.trim() : line);
    const newCompare = newLines.map((line) => ignoreWhitespace ? line.trim() : line);
    // Filter out blank lines for comparison if needed
    let oldIndices = [];
    let newIndices = [];
    if (ignoreBlankLines) {
        oldIndices = oldCompare
            .map((line, i) => (line !== '' ? i : -1))
            .filter((i) => i !== -1);
        newIndices = newCompare
            .map((line, i) => (line !== '' ? i : -1))
            .filter((i) => i !== -1);
    }
    else {
        oldIndices = oldCompare.map((_, i) => i);
        newIndices = newCompare.map((_, i) => i);
    }
    const oldFiltered = oldIndices.map((i) => oldCompare[i]);
    const newFiltered = newIndices.map((i) => newCompare[i]);
    // Compute LCS on filtered lines
    const lcsPairs = computeLCS(oldFiltered, newFiltered);
    // Convert LCS pairs back to original indices
    const matchedPairs = lcsPairs.map(([oi, ni]) => [
        oldIndices[oi],
        newIndices[ni],
    ]);
    // Helper to check if a line should be considered blank (for ignore_blank_lines)
    const isBlankLine = (line) => {
        return ignoreBlankLines && line.trim() === '';
    };
    // Build the diff hunks
    const hunks = [];
    let oldPos = 0;
    let newPos = 0;
    let matchIdx = 0;
    while (oldPos < oldLines.length || newPos < newLines.length) {
        // Check if current positions are a match
        if (matchIdx < matchedPairs.length &&
            matchedPairs[matchIdx][0] === oldPos &&
            matchedPairs[matchIdx][1] === newPos) {
            // Equal
            hunks.push({
                op: 'equal',
                content: oldLines[oldPos],
                old_start: oldPos + 1,
                new_start: newPos + 1,
                old_count: 1,
                new_count: 1,
            });
            oldPos++;
            newPos++;
            matchIdx++;
        }
        else {
            // Find the next match point
            let nextOldMatch = oldLines.length;
            let nextNewMatch = newLines.length;
            if (matchIdx < matchedPairs.length) {
                nextOldMatch = matchedPairs[matchIdx][0];
                nextNewMatch = matchedPairs[matchIdx][1];
            }
            // Delete lines from old until we reach the next match
            while (oldPos < nextOldMatch) {
                // When ignoring blank lines, treat blank lines as equal
                if (isBlankLine(oldLines[oldPos])) {
                    hunks.push({
                        op: 'equal',
                        content: oldLines[oldPos],
                        old_start: oldPos + 1,
                        old_count: 1,
                    });
                }
                else {
                    hunks.push({
                        op: 'delete',
                        content: oldLines[oldPos],
                        old_start: oldPos + 1,
                        old_count: 1,
                    });
                }
                oldPos++;
            }
            // Insert lines from new until we reach the next match
            while (newPos < nextNewMatch) {
                // When ignoring blank lines, treat blank lines as equal
                if (isBlankLine(newLines[newPos])) {
                    hunks.push({
                        op: 'equal',
                        content: newLines[newPos],
                        new_start: newPos + 1,
                        new_count: 1,
                    });
                }
                else {
                    hunks.push({
                        op: 'insert',
                        content: newLines[newPos],
                        new_start: newPos + 1,
                        new_count: 1,
                    });
                }
                newPos++;
            }
        }
    }
    // Apply context filtering
    const filteredHunks = applyContextFilter(hunks, contextLines);
    // Calculate stats
    const stats = calculateStats(filteredHunks);
    return { hunks: filteredHunks, stats };
}
/**
 * Apply context line filtering to hunks.
 */
function applyContextFilter(hunks, contextLines) {
    if (hunks.length === 0) {
        return [];
    }
    // Mark which hunks should be included based on context
    const include = new Array(hunks.length).fill(false);
    // Find all change positions
    const changeIndices = [];
    for (let i = 0; i < hunks.length; i++) {
        if (hunks[i].op !== 'equal') {
            changeIndices.push(i);
        }
    }
    // Mark context around changes
    for (const ci of changeIndices) {
        // Include the change itself
        include[ci] = true;
        // Include context before
        for (let j = Math.max(0, ci - contextLines); j < ci; j++) {
            include[j] = true;
        }
        // Include context after
        for (let j = ci + 1; j <= Math.min(hunks.length - 1, ci + contextLines); j++) {
            include[j] = true;
        }
    }
    return hunks.filter((_, i) => include[i]);
}
/**
 * Calculate diff statistics.
 */
function calculateStats(hunks) {
    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
        if (hunk.op === 'insert') {
            additions++;
        }
        else if (hunk.op === 'delete') {
            deletions++;
        }
    }
    // Changes are paired delete+insert operations
    const changes = Math.min(additions, deletions);
    return { additions, deletions, changes };
}
/**
 * Word-by-word diff.
 */
function diffWords(oldStr, newStr) {
    // Split into words, keeping whitespace and punctuation
    const tokenize = (s) => {
        const tokens = [];
        let current = '';
        let inWord = false;
        for (const char of s) {
            const isWordChar = /\w/.test(char);
            if (isWordChar) {
                if (!inWord && current) {
                    tokens.push(current);
                    current = '';
                }
                inWord = true;
                current += char;
            }
            else {
                if (inWord && current) {
                    tokens.push(current);
                    current = '';
                }
                inWord = false;
                current += char;
            }
        }
        if (current) {
            tokens.push(current);
        }
        return tokens;
    };
    const oldTokens = tokenize(oldStr);
    const newTokens = tokenize(newStr);
    const lcsPairs = computeLCS(oldTokens, newTokens);
    const hunks = [];
    let oldPos = 0;
    let newPos = 0;
    let matchIdx = 0;
    while (oldPos < oldTokens.length || newPos < newTokens.length) {
        if (matchIdx < lcsPairs.length &&
            lcsPairs[matchIdx][0] === oldPos &&
            lcsPairs[matchIdx][1] === newPos) {
            hunks.push({
                op: 'equal',
                content: oldTokens[oldPos],
            });
            oldPos++;
            newPos++;
            matchIdx++;
        }
        else {
            let nextOldMatch = oldTokens.length;
            let nextNewMatch = newTokens.length;
            if (matchIdx < lcsPairs.length) {
                nextOldMatch = lcsPairs[matchIdx][0];
                nextNewMatch = lcsPairs[matchIdx][1];
            }
            while (oldPos < nextOldMatch) {
                hunks.push({
                    op: 'delete',
                    content: oldTokens[oldPos],
                });
                oldPos++;
            }
            while (newPos < nextNewMatch) {
                hunks.push({
                    op: 'insert',
                    content: newTokens[newPos],
                });
                newPos++;
            }
        }
    }
    return hunks;
}
/**
 * Character-by-character diff.
 */
function diffChars(oldStr, newStr) {
    const oldChars = [...oldStr];
    const newChars = [...newStr];
    const lcsPairs = computeLCS(oldChars, newChars);
    const hunks = [];
    let oldPos = 0;
    let newPos = 0;
    let matchIdx = 0;
    // Group consecutive operations
    let currentOp = null;
    let currentContent = '';
    const flushCurrent = () => {
        if (currentOp !== null && currentContent !== '') {
            hunks.push({
                op: currentOp,
                content: currentContent,
            });
            currentContent = '';
            currentOp = null;
        }
    };
    const addChar = (op, char) => {
        if (currentOp !== op) {
            flushCurrent();
            currentOp = op;
        }
        currentContent += char;
    };
    while (oldPos < oldChars.length || newPos < newChars.length) {
        if (matchIdx < lcsPairs.length &&
            lcsPairs[matchIdx][0] === oldPos &&
            lcsPairs[matchIdx][1] === newPos) {
            addChar('equal', oldChars[oldPos]);
            oldPos++;
            newPos++;
            matchIdx++;
        }
        else {
            let nextOldMatch = oldChars.length;
            let nextNewMatch = newChars.length;
            if (matchIdx < lcsPairs.length) {
                nextOldMatch = lcsPairs[matchIdx][0];
                nextNewMatch = lcsPairs[matchIdx][1];
            }
            while (oldPos < nextOldMatch) {
                addChar('delete', oldChars[oldPos]);
                oldPos++;
            }
            while (newPos < nextNewMatch) {
                addChar('insert', newChars[newPos]);
                newPos++;
            }
        }
    }
    flushCurrent();
    return hunks;
}
