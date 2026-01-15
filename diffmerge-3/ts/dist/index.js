"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitLines = exports.normalizeLineEndings = exports.isBinary = exports.getStats = exports.resolveConflict = exports.extractConflicts = exports.hasConflicts = exports.merge3 = exports.parsePatch = exports.reversePatch = exports.applyPatch = exports.createPatch = exports.diffChars = exports.diffWords = exports.diffLines = void 0;
// Re-export types
__exportStar(require("./types"), exports);
// Re-export diff functions
var diff_1 = require("./diff");
Object.defineProperty(exports, "diffLines", { enumerable: true, get: function () { return diff_1.diffLines; } });
Object.defineProperty(exports, "diffWords", { enumerable: true, get: function () { return diff_1.diffWords; } });
Object.defineProperty(exports, "diffChars", { enumerable: true, get: function () { return diff_1.diffChars; } });
// Re-export patch functions
var patch_1 = require("./patch");
Object.defineProperty(exports, "createPatch", { enumerable: true, get: function () { return patch_1.createPatch; } });
Object.defineProperty(exports, "applyPatch", { enumerable: true, get: function () { return patch_1.applyPatch; } });
Object.defineProperty(exports, "reversePatch", { enumerable: true, get: function () { return patch_1.reversePatch; } });
Object.defineProperty(exports, "parsePatch", { enumerable: true, get: function () { return patch_1.parsePatch; } });
// Re-export merge functions
var merge_1 = require("./merge");
Object.defineProperty(exports, "merge3", { enumerable: true, get: function () { return merge_1.merge3; } });
Object.defineProperty(exports, "hasConflicts", { enumerable: true, get: function () { return merge_1.hasConflicts; } });
Object.defineProperty(exports, "extractConflicts", { enumerable: true, get: function () { return merge_1.extractConflicts; } });
Object.defineProperty(exports, "resolveConflict", { enumerable: true, get: function () { return merge_1.resolveConflict; } });
// Re-export utility functions
var utils_1 = require("./utils");
Object.defineProperty(exports, "getStats", { enumerable: true, get: function () { return utils_1.getStats; } });
Object.defineProperty(exports, "isBinary", { enumerable: true, get: function () { return utils_1.isBinary; } });
Object.defineProperty(exports, "normalizeLineEndings", { enumerable: true, get: function () { return utils_1.normalizeLineEndings; } });
Object.defineProperty(exports, "splitLines", { enumerable: true, get: function () { return utils_1.splitLines; } });
