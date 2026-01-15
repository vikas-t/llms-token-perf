export * from "./types";
export { diffLines, diffWords, diffChars } from "./diff";
export { createPatch, applyPatch, reversePatch, parsePatch } from "./patch";
export { merge3, hasConflicts, extractConflicts, resolveConflict } from "./merge";
export { getStats, isBinary, normalizeLineEndings, splitLines } from "./utils";
