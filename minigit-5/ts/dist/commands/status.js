"use strict";
// status command - Show working tree status
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
exports.status = status;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function status(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse flags
    let shortFormat = false;
    let porcelain = false;
    for (const arg of args) {
        if (arg === '--short' || arg === '-s') {
            shortFormat = true;
        }
        else if (arg === '--porcelain') {
            porcelain = true;
            shortFormat = true;
        }
    }
    // Get current branch
    const branch = (0, refs_1.getCurrentBranch)(repoRoot);
    // Get HEAD tree files
    const headFiles = new Map();
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (headSha) {
        try {
            const treeSha = (0, objects_1.getTreeFromTreeIsh)(headSha, repoRoot);
            (0, objects_1.walkTree)(treeSha, '', repoRoot).forEach((value, key) => headFiles.set(key, value));
        }
        catch {
            // No tree
        }
    }
    // Get index files
    const index = (0, index_file_1.readIndex)(repoRoot);
    const indexFiles = new Map();
    for (const entry of index.entries) {
        indexFiles.set(entry.path, { sha: entry.sha, mode: entry.mode });
    }
    // Get working tree files
    const workingFiles = new Set();
    collectWorkingFiles(repoRoot, repoRoot, workingFiles);
    // Calculate status
    const stagedNew = [];
    const stagedModified = [];
    const stagedDeleted = [];
    const unstagedModified = [];
    const unstagedDeleted = [];
    const untracked = [];
    // Compare HEAD with index (staged changes)
    for (const [filePath, indexEntry] of indexFiles) {
        const headEntry = headFiles.get(filePath);
        if (!headEntry) {
            stagedNew.push(filePath);
        }
        else if (headEntry.sha !== indexEntry.sha) {
            stagedModified.push(filePath);
        }
    }
    // Files in HEAD but not in index = staged deleted
    for (const [filePath] of headFiles) {
        if (!indexFiles.has(filePath)) {
            stagedDeleted.push(filePath);
        }
    }
    // Compare index with working tree (unstaged changes)
    for (const [filePath, indexEntry] of indexFiles) {
        const fullPath = path.join(repoRoot, filePath);
        if (!fs.existsSync(fullPath)) {
            unstagedDeleted.push(filePath);
        }
        else {
            // Check if modified
            const stats = fs.lstatSync(fullPath);
            if (!stats.isDirectory()) {
                let content;
                if (stats.isSymbolicLink()) {
                    content = Buffer.from(fs.readlinkSync(fullPath));
                }
                else {
                    content = fs.readFileSync(fullPath);
                }
                const workingSha = (0, objects_1.hashObject)('blob', content);
                if (workingSha !== indexEntry.sha) {
                    unstagedModified.push(filePath);
                }
            }
        }
    }
    // Untracked files
    for (const filePath of workingFiles) {
        if (!indexFiles.has(filePath)) {
            untracked.push(filePath);
        }
    }
    // Sort all arrays
    stagedNew.sort();
    stagedModified.sort();
    stagedDeleted.sort();
    unstagedModified.sort();
    unstagedDeleted.sort();
    untracked.sort();
    // Output
    if (shortFormat) {
        // Short format: XY filename
        for (const f of stagedNew) {
            const y = unstagedModified.includes(f) ? 'M' : unstagedDeleted.includes(f) ? 'D' : ' ';
            console.log(`A${y} ${f}`);
        }
        for (const f of stagedModified) {
            const y = unstagedModified.includes(f) ? 'M' : unstagedDeleted.includes(f) ? 'D' : ' ';
            console.log(`M${y} ${f}`);
        }
        for (const f of stagedDeleted) {
            console.log(`D  ${f}`);
        }
        for (const f of unstagedModified) {
            if (!stagedNew.includes(f) && !stagedModified.includes(f)) {
                console.log(` M ${f}`);
            }
        }
        for (const f of unstagedDeleted) {
            if (!stagedNew.includes(f) && !stagedModified.includes(f)) {
                console.log(` D ${f}`);
            }
        }
        for (const f of untracked) {
            console.log(`?? ${f}`);
        }
    }
    else {
        // Long format
        if ((0, refs_1.isDetachedHead)(repoRoot)) {
            console.log(`HEAD detached at ${headSha?.slice(0, 7) || '(unknown)'}`);
        }
        else {
            console.log(`On branch ${branch || 'main'}`);
        }
        const hasStaged = stagedNew.length > 0 || stagedModified.length > 0 || stagedDeleted.length > 0;
        const hasUnstaged = unstagedModified.length > 0 || unstagedDeleted.length > 0;
        const hasUntracked = untracked.length > 0;
        if (hasStaged) {
            console.log('');
            console.log('Changes to be committed:');
            console.log('  (use "minigit restore --staged <file>..." to unstage)');
            console.log('');
            for (const f of stagedNew) {
                console.log(`\tnew file:   ${f}`);
            }
            for (const f of stagedModified) {
                console.log(`\tmodified:   ${f}`);
            }
            for (const f of stagedDeleted) {
                console.log(`\tdeleted:    ${f}`);
            }
        }
        if (hasUnstaged) {
            console.log('');
            console.log('Changes not staged for commit:');
            console.log('  (use "minigit add <file>..." to update what will be committed)');
            console.log('');
            for (const f of unstagedModified) {
                console.log(`\tmodified:   ${f}`);
            }
            for (const f of unstagedDeleted) {
                console.log(`\tdeleted:    ${f}`);
            }
        }
        if (hasUntracked) {
            console.log('');
            console.log('Untracked files:');
            console.log('  (use "minigit add <file>..." to include in what will be committed)');
            console.log('');
            for (const f of untracked) {
                console.log(`\t${f}`);
            }
        }
        if (!hasStaged && !hasUnstaged && !hasUntracked) {
            console.log('nothing to commit, working tree clean');
        }
    }
    return 0;
}
function collectWorkingFiles(dir, repoRoot, result) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectWorkingFiles(fullPath, repoRoot, result);
        }
        else {
            const relativePath = (0, utils_1.normalizePath)(path.relative(repoRoot, fullPath));
            result.add(relativePath);
        }
    }
}
