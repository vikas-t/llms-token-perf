"use strict";
// Utility functions for diff/merge library
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = getStats;
exports.isBinary = isBinary;
exports.normalizeLineEndings = normalizeLineEndings;
exports.splitLines = splitLines;
exports.joinLines = joinLines;
exports.isBlankLine = isBlankLine;
exports.normalizeForComparison = normalizeForComparison;
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
 * Convert all line endings to \n.
 */
function normalizeLineEndings(content) {
    // Replace CRLF first, then CR
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
/**
 * Split content into lines, preserving empty trailing line if present.
 */
function splitLines(content) {
    if (content === '') {
        return [];
    }
    // Split by newline
    const lines = content.split('\n');
    // If content ends with newline, the last element will be empty string
    // We keep it to preserve the "has trailing newline" info
    return lines;
}
/**
 * Join lines back into content.
 */
function joinLines(lines) {
    return lines.join('\n');
}
/**
 * Check if a line is blank (only whitespace).
 */
function isBlankLine(line) {
    return line.trim() === '';
}
/**
 * Trim whitespace from a line for comparison purposes.
 */
function normalizeForComparison(line, ignoreWhitespace) {
    if (ignoreWhitespace) {
        return line.trim();
    }
    return line;
}
