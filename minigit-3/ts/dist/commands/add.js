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
const objects_1 = require("../objects");
const index_file_1 = require("../index-file");
function add(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let pathspecs = [];
    let updateOnly = false;
    let all = false;
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-A' || arg === '--all') {
            all = true;
        }
        else if (arg === '-u' || arg === '--update') {
            updateOnly = true;
        }
        else {
            pathspecs.push(arg);
        }
    }
    if (all) {
        pathspecs = ['.'];
    }
    if (pathspecs.length === 0 && !updateOnly) {
        console.error('Nothing specified, nothing added.');
        process.exit(0);
    }
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const trackedFiles = new Set(entries.map(e => e.name));
    const newEntries = new Map();
    // Copy existing entries
    for (const entry of entries) {
        newEntries.set(entry.name, entry);
    }
    // Get all files to potentially add
    const filesToProcess = [];
    if (updateOnly) {
        // Only process tracked files
        for (const entry of entries) {
            const fullPath = path.join(repoRoot, entry.name);
            if (fs.existsSync(fullPath)) {
                filesToProcess.push(entry.name);
            }
            else {
                // File deleted - mark for removal
                newEntries.delete(entry.name);
            }
        }
    }
    else {
        // Process specified pathspecs
        for (const pathspec of pathspecs) {
            const absPath = path.resolve(process.cwd(), pathspec);
            const relPath = path.relative(repoRoot, absPath);
            if (!fs.existsSync(absPath)) {
                console.error(`fatal: pathspec '${pathspec}' did not match any files`);
                process.exit(1);
            }
            if (fs.statSync(absPath).isDirectory()) {
                // Add all files in directory
                addDirectory(absPath, repoRoot, filesToProcess, all);
            }
            else {
                filesToProcess.push((0, utils_1.normalizePath)(relPath));
            }
        }
    }
    // Process each file
    for (const relPath of filesToProcess) {
        const absPath = path.join(repoRoot, relPath);
        if (!fs.existsSync(absPath)) {
            // File deleted
            if (all || updateOnly) {
                newEntries.delete(relPath);
            }
            continue;
        }
        const stats = fs.statSync(absPath);
        if (stats.isSymbolicLink()) {
            // Handle symlink
            const target = fs.readlinkSync(absPath);
            const sha = (0, objects_1.writeBlob)(Buffer.from(target), repoRoot);
            const entry = createIndexEntry(relPath, sha, 0o120000, stats);
            newEntries.set(relPath, entry);
        }
        else if (stats.isFile()) {
            const content = fs.readFileSync(absPath);
            const sha = (0, objects_1.writeBlob)(content, repoRoot);
            const mode = (0, utils_1.getFileMode)(absPath);
            const entry = createIndexEntry(relPath, sha, mode, stats);
            newEntries.set(relPath, entry);
        }
    }
    // Handle -A flag: also remove deleted files
    if (all) {
        for (const entry of entries) {
            const fullPath = path.join(repoRoot, entry.name);
            if (!fs.existsSync(fullPath)) {
                newEntries.delete(entry.name);
            }
        }
    }
    // Write updated index
    (0, index_file_1.writeIndex)(Array.from(newEntries.values()), repoRoot);
}
function addDirectory(dirPath, repoRoot, files, includeNew) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        // Skip .minigit directory
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dirPath, entry.name);
        const relPath = (0, utils_1.normalizePath)(path.relative(repoRoot, fullPath));
        if (entry.isDirectory()) {
            addDirectory(fullPath, repoRoot, files, includeNew);
        }
        else if (entry.isFile() || entry.isSymbolicLink()) {
            files.push(relPath);
        }
    }
}
function createIndexEntry(name, sha, mode, stats) {
    const now = Math.floor(Date.now() / 1000);
    return {
        ctimeSec: Math.floor(stats.ctimeMs / 1000),
        ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
        mtimeSec: Math.floor(stats.mtimeMs / 1000),
        mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
        dev: stats.dev,
        ino: stats.ino,
        mode,
        uid: stats.uid,
        gid: stats.gid,
        size: stats.size,
        sha,
        flags: Math.min(name.length, 0xfff),
        name
    };
}
