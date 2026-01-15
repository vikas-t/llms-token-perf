"use strict";
// Type definitions for Mini Git
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDEX_VERSION = exports.INDEX_SIGNATURE = exports.FILE_MODE = void 0;
exports.FILE_MODE = {
    REGULAR: 0o100644,
    EXECUTABLE: 0o100755,
    SYMLINK: 0o120000,
    TREE: 0o40000,
};
exports.INDEX_SIGNATURE = 'DIRC';
exports.INDEX_VERSION = 2;
