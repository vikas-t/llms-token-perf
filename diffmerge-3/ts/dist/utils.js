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
    return content.includes('\x00');
}
/**
 * Normalize all line endings to \n.
 */
function normalizeLineEndings(content) {
    // First replace CRLF, then CR
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
/**
 * Split content into lines, preserving empty trailing line if present.
 */
function splitLines(content) {
    if (content === '') {
        return [];
    }
    const normalized = normalizeLineEndings(content);
    const lines = normalized.split('\n');
    // If content ends with newline, the split creates an extra empty string
    // We need to handle this correctly
    if (normalized.endsWith('\n') && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}
