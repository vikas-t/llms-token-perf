// Diff operation types
export type DiffOp = "equal" | "insert" | "delete";

// A single hunk in a diff
export interface DiffHunk {
  op: DiffOp;
  content: string;
  old_start?: number;
  new_start?: number;
  old_count?: number;
  new_count?: number;
}

// Statistics about a diff
export interface DiffStats {
  additions: number;
  deletions: number;
  changes: number;
}

// Complete result of a diff operation
export interface DiffResult {
  hunks: DiffHunk[];
  stats: DiffStats;
}

// Options for line-based diff
export interface DiffOptions {
  ignore_whitespace?: boolean;
  ignore_blank_lines?: boolean;
  context_lines?: number;
}

// Options for creating patches
export interface PatchOptions {
  old_file?: string;
  new_file?: string;
  context_lines?: number;
}

// A line in a patch
export interface PatchLine {
  op: " " | "+" | "-";
  content: string;
}

// A hunk in a parsed patch
export interface PatchHunk {
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
  lines: PatchLine[];
}

// A parsed patch
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

// A conflict region in a merge
export interface Conflict {
  base: string;
  ours: string;
  theirs: string;
  start_line: number;
  end_line: number;
}

// Result of a three-way merge
export interface MergeResult {
  content: string;
  has_conflicts: boolean;
  conflicts: Conflict[];
}

// Options for three-way merge
export interface MergeOptions {
  conflict_style?: "diff3" | "merge";
  ours_label?: string;
  theirs_label?: string;
  base_label?: string;
}

// Error types
export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}
