"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = getStats;
exports.isBinary = isBinary;
exports.normalizeLineEndings = normalizeLineEndings;
exports.splitLines = splitLines;
/**
 * Get statistics from a diff result.
 */
function getStats(diff) {
    return diff.stats;
}
/**
 * Detect if content appears to be binary (contains null bytes).
 */
function isBinary(content) {
    return content.includes("\0");
}
/**
 * Convert all line endings to \n.
 */
function normalizeLineEndings(content) {
    // Replace CRLF first, then CR
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
/**
 * Split content into lines, preserving empty trailing line if present.
 */
function splitLines(content) {
    if (content === "") {
        return [];
    }
    // Split by newline
    const lines = content.split("\n");
    // If content ends with newline, the last element will be empty
    // We want to keep track of lines properly
    if (content.endsWith("\n")) {
        // Remove the trailing empty string since it's just indicating the newline
        lines.pop();
    }
    return lines;
}
