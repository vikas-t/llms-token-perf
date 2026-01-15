"use strict";
// Package entry - exports public API
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeError = exports.ParseError = exports.PatchError = exports.DiffError = exports.splitLines = exports.normalizeLineEndings = exports.isBinary = exports.getStats = exports.resolveConflict = exports.extractConflicts = exports.hasConflicts = exports.merge3 = exports.parsePatch = exports.reversePatch = exports.applyPatch = exports.createPatch = exports.diffChars = exports.diffWords = exports.diffLines = void 0;
// Diff functions
var diff_1 = require("./diff");
Object.defineProperty(exports, "diffLines", { enumerable: true, get: function () { return diff_1.diffLines; } });
Object.defineProperty(exports, "diffWords", { enumerable: true, get: function () { return diff_1.diffWords; } });
Object.defineProperty(exports, "diffChars", { enumerable: true, get: function () { return diff_1.diffChars; } });
// Patch functions
var patch_1 = require("./patch");
Object.defineProperty(exports, "createPatch", { enumerable: true, get: function () { return patch_1.createPatch; } });
Object.defineProperty(exports, "applyPatch", { enumerable: true, get: function () { return patch_1.applyPatch; } });
Object.defineProperty(exports, "reversePatch", { enumerable: true, get: function () { return patch_1.reversePatch; } });
Object.defineProperty(exports, "parsePatch", { enumerable: true, get: function () { return patch_1.parsePatch; } });
// Merge functions
var merge_1 = require("./merge");
Object.defineProperty(exports, "merge3", { enumerable: true, get: function () { return merge_1.merge3; } });
Object.defineProperty(exports, "hasConflicts", { enumerable: true, get: function () { return merge_1.hasConflicts; } });
Object.defineProperty(exports, "extractConflicts", { enumerable: true, get: function () { return merge_1.extractConflicts; } });
Object.defineProperty(exports, "resolveConflict", { enumerable: true, get: function () { return merge_1.resolveConflict; } });
// Utility functions
var utils_1 = require("./utils");
Object.defineProperty(exports, "getStats", { enumerable: true, get: function () { return utils_1.getStats; } });
Object.defineProperty(exports, "isBinary", { enumerable: true, get: function () { return utils_1.isBinary; } });
Object.defineProperty(exports, "normalizeLineEndings", { enumerable: true, get: function () { return utils_1.normalizeLineEndings; } });
Object.defineProperty(exports, "splitLines", { enumerable: true, get: function () { return utils_1.splitLines; } });
// Types
var types_1 = require("./types");
Object.defineProperty(exports, "DiffError", { enumerable: true, get: function () { return types_1.DiffError; } });
Object.defineProperty(exports, "PatchError", { enumerable: true, get: function () { return types_1.PatchError; } });
Object.defineProperty(exports, "ParseError", { enumerable: true, get: function () { return types_1.ParseError; } });
Object.defineProperty(exports, "MergeError", { enumerable: true, get: function () { return types_1.MergeError; } });
