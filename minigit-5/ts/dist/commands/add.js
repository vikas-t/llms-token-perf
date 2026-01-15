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
const refs_1 = require("../refs");
const objects_2 = require("../objects");
function add(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse flags
    let updateOnly = false;
    let addAll = false;
    const paths = [];
    for (const arg of args) {
        if (arg === '-u' || arg === '--update') {
            updateOnly = true;
        }
        else if (arg === '-A' || arg === '--all') {
            addAll = true;
        }
        else {
            paths.push(arg);
        }
    }
    // If no paths and no flags, error
    if (paths.length === 0 && !addAll && !updateOnly) {
        console.error('Nothing specified, nothing added.');
        return 1;
    }
    // Get current tracked files from HEAD commit
    const trackedFiles = new Set();
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (headSha) {
        try {
            const treeSha = (0, objects_2.getTreeFromTreeIsh)(headSha, repoRoot);
            const treeFiles = (0, objects_2.walkTree)(treeSha, '', repoRoot);
            treeFiles.forEach((_, filePath) => trackedFiles.add(filePath));
        }
        catch {
            // No tree yet
        }
    }
    // Also add files that are in the index
    const currentIndex = (0, index_file_1.readIndex)(repoRoot);
    for (const entry of currentIndex.entries) {
        trackedFiles.add(entry.path);
    }
    // Collect files to add
    const filesToAdd = [];
    const filesToRemove = [];
    if (addAll || updateOnly) {
        // -A: stage all changes (new, modified, deleted)
        // -u: stage only tracked files (modified, deleted)
        // Find all files in working tree
        const workingTreeFiles = collectAllFiles(repoRoot, repoRoot);
        if (addAll) {
            // Add all working tree files
            filesToAdd.push(...workingTreeFiles);
            // Mark deleted tracked files for removal
            for (const trackedFile of trackedFiles) {
                const fullPath = path.join(repoRoot, trackedFile);
                if (!fs.existsSync(fullPath)) {
                    filesToRemove.push(trackedFile);
                }
            }
        }
        else {
            // Update only - only tracked files
            for (const file of workingTreeFiles) {
                if (trackedFiles.has(file)) {
                    filesToAdd.push(file);
                }
            }
            // Mark deleted tracked files for removal
            for (const trackedFile of trackedFiles) {
                const fullPath = path.join(repoRoot, trackedFile);
                if (!fs.existsSync(fullPath)) {
                    filesToRemove.push(trackedFile);
                }
            }
        }
    }
    else {
        // Add specific paths
        for (const p of paths) {
            const resolvedPath = path.resolve(process.cwd(), p);
            if (!fs.existsSync(resolvedPath)) {
                // Check if it's a tracked file that was deleted
                const relativePath = (0, utils_1.normalizePath)(path.relative(repoRoot, resolvedPath));
                if (trackedFiles.has(relativePath)) {
                    filesToRemove.push(relativePath);
                    continue;
                }
                console.error(`fatal: pathspec '${p}' did not match any files`);
                return 1;
            }
            const stats = fs.statSync(resolvedPath);
            if (stats.isDirectory()) {
                // Add all files in directory
                const dirFiles = collectAllFiles(resolvedPath, repoRoot);
                filesToAdd.push(...dirFiles);
            }
            else {
                const relativePath = (0, utils_1.normalizePath)(path.relative(repoRoot, resolvedPath));
                filesToAdd.push(relativePath);
            }
        }
    }
    // Read current index
    const index = (0, index_file_1.readIndex)(repoRoot);
    // Remove deleted files from index
    for (const filePath of filesToRemove) {
        const idx = index.entries.findIndex(e => e.path === filePath);
        if (idx >= 0) {
            index.entries.splice(idx, 1);
        }
    }
    // Add/update files in index
    for (const filePath of filesToAdd) {
        const fullPath = path.join(repoRoot, filePath);
        if (!fs.existsSync(fullPath)) {
            continue;
        }
        const stats = fs.lstatSync(fullPath);
        // Skip directories
        if (stats.isDirectory()) {
            continue;
        }
        // Read file content
        let content;
        let mode;
        if (stats.isSymbolicLink()) {
            // For symlinks, store the link target as content
            const target = fs.readlinkSync(fullPath);
            content = Buffer.from(target);
            mode = 0o120000;
        }
        else {
            content = fs.readFileSync(fullPath);
            mode = (0, utils_1.getFileMode)(fullPath);
        }
        // Create blob object
        const sha = (0, objects_1.createBlob)(content, true, repoRoot);
        // Update or add index entry
        const existingIdx = index.entries.findIndex(e => e.path === filePath);
        const entry = {
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
            flags: Math.min(filePath.length, 0xfff),
            path: filePath,
        };
        if (existingIdx >= 0) {
            index.entries[existingIdx] = entry;
        }
        else {
            index.entries.push(entry);
        }
    }
    // Write updated index
    (0, index_file_1.writeIndex)(index, repoRoot);
    return 0;
}
function collectAllFiles(dir, repoRoot) {
    const result = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        // Skip .minigit directory
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectAllFiles(fullPath, repoRoot));
        }
        else {
            const relativePath = (0, utils_1.normalizePath)(path.relative(repoRoot, fullPath));
            result.push(relativePath);
        }
    }
    return result;
}
