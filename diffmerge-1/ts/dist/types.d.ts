export type DiffOp = "equal" | "insert" | "delete";
export interface DiffHunk {
    op: DiffOp;
    content: string;
    old_start?: number;
    new_start?: number;
    old_count?: number;
    new_count?: number;
}
export interface DiffStats {
    additions: number;
    deletions: number;
    changes: number;
}
export interface DiffResult {
    hunks: DiffHunk[];
    stats: DiffStats;
}
export interface DiffOptions {
    ignore_whitespace?: boolean;
    ignore_blank_lines?: boolean;
    context_lines?: number;
}
export interface PatchOptions {
    old_file?: string;
    new_file?: string;
    context_lines?: number;
}
export interface PatchLine {
    op: " " | "+" | "-";
    content: string;
}
export interface PatchHunk {
    old_start: number;
    old_count: number;
    new_start: number;
    new_count: number;
    lines: PatchLine[];
}
export interface ParsedPatch {
    old_file: string;
    new_file: string;
    hunks: PatchHunk[];
}
export interface ApplyResult {
    content: string;
    success: boolean;
    hunks_applied: number;
    hunks_failed: number;
    errors: string[];
}
export interface Conflict {
    base: string;
    ours: string;
    theirs: string;
    start_line: number;
    end_line: number;
}
export interface MergeResult {
    content: string;
    has_conflicts: boolean;
    conflicts: Conflict[];
}
export interface MergeOptions {
    conflict_style?: "diff3" | "merge";
    ours_label?: string;
    theirs_label?: string;
    base_label?: string;
}
export declare class DiffError extends Error {
    constructor(message: string);
}
export declare class PatchError extends Error {
    constructor(message: string);
}
export declare class ParseError extends Error {
    constructor(message: string);
}
export declare class MergeError extends Error {
    constructor(message: string);
}
