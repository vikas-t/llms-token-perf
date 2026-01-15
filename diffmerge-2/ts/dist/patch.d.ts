import { PatchOptions, ApplyResult, ParsedPatch } from './types';
/**
 * Generate unified diff format patch.
 */
export declare function createPatch(oldText: string, newText: string, options?: PatchOptions): string;
/**
 * Apply a unified diff patch to content.
 */
export declare function applyPatch(content: string, patch: string): ApplyResult;
/**
 * Reverse a patch (swap additions and deletions).
 */
export declare function reversePatch(patch: string): string;
/**
 * Parse unified diff format into structured data.
 */
export declare function parsePatch(patch: string): ParsedPatch;
