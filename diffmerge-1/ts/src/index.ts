// Re-export all types
export * from "./types";

// Re-export diff functions
export { diffLines, diffWords, diffChars } from "./diff";

// Re-export patch functions
export { createPatch, applyPatch, reversePatch, parsePatch } from "./patch";

// Re-export merge functions
export { merge3, hasConflicts, extractConflicts, resolveConflict } from "./merge";

// Re-export utility functions
export { getStats, isBinary, normalizeLineEndings, splitLines } from "./utils";
