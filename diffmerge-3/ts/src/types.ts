// Diff operation types
export type DiffOp = 'equal' | 'insert' | 'delete';

// Diff hunk representing a segment of diff
export interface DiffHunk {
  op: DiffOp;
  content: string;
  old_start?: number;
  new_start?: number;
  old_count?: number;
  new_count?: number;
}

// Statistics for a diff
export interface DiffStats {
  additions: number;
  deletions: number;
  changes: number;
}

// Complete diff result
export interface DiffResult {
  hunks: DiffHunk[];
  stats: DiffStats;
}

// Options for diff operations
export interface DiffOptions {
  ignore_whitespace?: boolean;
  ignore_blank_lines?: boolean;
  context_lines?: number;
}

// Patch options
export interface PatchOptions {
  old_file?: string;
  new_file?: string;
  context_lines?: number;
}

// Patch line representation
export interface PatchLine {
  op: ' ' | '+' | '-';
  content: string;
}

// Patch hunk structure
export interface PatchHunk {
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
  lines: PatchLine[];
}

// Parsed patch structure
export interface ParsedPatch {
  old_file: string;
  new_file: string;
  hunks: PatchHunk[];
}

// Result of applying a patch
export interface ApplyResult {
  content: string;
  success: boolean;
  hunks_applied: number;
  hunks_failed: number;
  errors: string[];
}

// Conflict structure for merge
export interface Conflict {
  base: string;
  ours: string;
  theirs: string;
  start_line: number;
  end_line: number;
}

// Merge result
export interface MergeResult {
  content: string;
  has_conflicts: boolean;
  conflicts: Conflict[];
}

// Merge options
export interface MergeOptions {
  conflict_style?: 'diff3' | 'merge';
  ours_label?: string;
  theirs_label?: string;
  base_label?: string;
}

// Custom error classes
export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffError';
  }
}

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeError';
  }
}
