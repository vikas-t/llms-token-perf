// Package entry - exports public API

// Diff functions
export { diffLines, diffWords, diffChars } from './diff';

// Patch functions
export { createPatch, applyPatch, reversePatch, parsePatch } from './patch';

// Merge functions
export { merge3, hasConflicts, extractConflicts, resolveConflict } from './merge';

// Utility functions
export { getStats, isBinary, normalizeLineEndings, splitLines } from './utils';

// Types
export {
  DiffOp,
  DiffHunk,
  DiffResult,
  DiffStats,
  DiffOptions,
  PatchOptions,
  ApplyResult,
  PatchLine,
  PatchHunk,
  ParsedPatch,
  Conflict,
  MergeResult,
  MergeOptions,
  DiffError,
  PatchError,
  ParseError,
  MergeError,
} from './types';
