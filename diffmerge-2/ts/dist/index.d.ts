export { diffLines, diffWords, diffChars } from './diff';
export { createPatch, applyPatch, reversePatch, parsePatch } from './patch';
export { merge3, hasConflicts, extractConflicts, resolveConflict } from './merge';
export { getStats, isBinary, normalizeLineEndings, splitLines } from './utils';
export { DiffOp, DiffHunk, DiffResult, DiffStats, DiffOptions, PatchOptions, ApplyResult, PatchLine, PatchHunk, ParsedPatch, Conflict, MergeResult, MergeOptions, DiffError, PatchError, ParseError, MergeError, } from './types';
