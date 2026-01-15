"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeError = exports.ParseError = exports.PatchError = exports.DiffError = void 0;
// Custom error classes
class DiffError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DiffError';
    }
}
exports.DiffError = DiffError;
class PatchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PatchError';
    }
}
exports.PatchError = PatchError;
class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParseError';
    }
}
exports.ParseError = ParseError;
class MergeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MergeError';
    }
}
exports.MergeError = MergeError;
