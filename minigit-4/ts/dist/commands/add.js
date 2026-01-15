"use strict";
// add command - Stage files for commit
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.add = add;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
const objects_1 = require("../objects");
function add(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let all = false;
    let update = false;
    const paths = [];
    for (const arg of args) {
        if (arg === '-A' || arg === '--all') {
            all = true;
        }
        else if (arg === '-u' || arg === '--update') {
            update = true;
        }
        else {
            paths.push(arg);
        }
    }
    let entries = (0, index_file_1.readIndex)(repoRoot);
    if (all) {
        // Stage all changes (new, modified, deleted)
        entries = addAllChanges(repoRoot, entries);
    }
    else if (update) {
        // Stage only tracked file modifications and deletions
        entries = updateTrackedFiles(repoRoot, entries);
    }
    else if (paths.length === 0) {
        console.error('fatal: no pathspec given');
        return 1;
    }
    else {
        // Stage specific paths
        for (const p of paths) {
            const result = addPath(repoRoot, entries, p);
            if (result.error) {
                console.error(result.error);
                return 1;
            }
            entries = result.entries;
        }
    }
    (0, index_file_1.writeIndex)(repoRoot, entries);
    return 0;
}
function addPath(repoRoot, entries, pathSpec) {
    const fullPath = path.resolve(repoRoot, pathSpec);
    // Check if path exists
    if (!fs.existsSync(fullPath)) {
        // Check if it was a tracked file that was deleted
        const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
        const existingEntry = entries.find((e) => e.name === relativePath);
        if (existingEntry) {
            // Mark as deleted by removing from index
            entries = (0, index_file_1.removeFromIndex)(entries, relativePath);
            return { entries };
        }
        return { entries, error: `fatal: pathspec '${pathSpec}' did not match any files` };
    }
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) {
        // Add all files in directory recursively
        return addDirectory(repoRoot, entries, fullPath);
    }
    else if (stat.isSymbolicLink()) {
        // Add symlink
        const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
        const sha = (0, objects_1.createBlobFromSymlink)(repoRoot, fullPath);
        const entry = (0, index_file_1.createIndexEntryFromFile)(relativePath, sha, 0o120000, stat);
        entries = (0, index_file_1.addToIndex)(entries, entry);
        return { entries };
    }
    else {
        // Add regular file
        const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
        const sha = (0, objects_1.createBlobFromFile)(repoRoot, fullPath);
        const mode = (0, utils_1.getFileModeFromStat)(stat);
        const entry = (0, index_file_1.createIndexEntryFromFile)(relativePath, sha, mode, stat);
        entries = (0, index_file_1.addToIndex)(entries, entry);
        return { entries };
    }
}
function addDirectory(repoRoot, entries, dirPath) {
    const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of dirEntries) {
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const result = addDirectory(repoRoot, entries, fullPath);
            if (result.error)
                return result;
            entries = result.entries;
        }
        else if (entry.isSymbolicLink()) {
            const stat = fs.lstatSync(fullPath);
            const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
            const sha = (0, objects_1.createBlobFromSymlink)(repoRoot, fullPath);
            const indexEntry = (0, index_file_1.createIndexEntryFromFile)(relativePath, sha, 0o120000, stat);
            entries = (0, index_file_1.addToIndex)(entries, indexEntry);
        }
        else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
            const sha = (0, objects_1.createBlobFromFile)(repoRoot, fullPath);
            const mode = (0, utils_1.getFileModeFromStat)(stat);
            const indexEntry = (0, index_file_1.createIndexEntryFromFile)(relativePath, sha, mode, stat);
            entries = (0, index_file_1.addToIndex)(entries, indexEntry);
        }
    }
    return { entries };
}
function addAllChanges(repoRoot, entries) {
    // Get all tracked files from index
    const trackedPaths = new Set(entries.map((e) => e.name));
    // Remove deleted files from index
    entries = entries.filter((e) => {
        const fullPath = path.join(repoRoot, e.name);
        return fs.existsSync(fullPath);
    });
    // Add/update all files in working directory
    const result = addDirectory(repoRoot, entries, repoRoot);
    return result.entries;
}
function updateTrackedFiles(repoRoot, entries) {
    const newEntries = [];
    for (const entry of entries) {
        const fullPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(fullPath)) {
            // File deleted - don't include in new entries
            continue;
        }
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink()) {
            const sha = (0, objects_1.createBlobFromSymlink)(repoRoot, fullPath);
            const newEntry = (0, index_file_1.createIndexEntryFromFile)(entry.name, sha, 0o120000, stat);
            newEntries.push(newEntry);
        }
        else {
            const sha = (0, objects_1.createBlobFromFile)(repoRoot, fullPath);
            const mode = (0, utils_1.getFileModeFromStat)(stat);
            const newEntry = (0, index_file_1.createIndexEntryFromFile)(entry.name, sha, mode, stat);
            newEntries.push(newEntry);
        }
    }
    return newEntries;
}
