"use strict";
// commit command - Create a new commit
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
exports.commit = commit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const objects_1 = require("../objects");
const index_file_1 = require("../index-file");
const refs_1 = require("../refs");
function commit(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let message = '';
    let amend = false;
    let autoStage = false;
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-m' && i + 1 < args.length) {
            message = args[++i];
        }
        else if (arg === '--amend') {
            amend = true;
        }
        else if (arg === '-a') {
            autoStage = true;
        }
    }
    if (!message && !amend) {
        console.error('error: no commit message specified');
        process.exit(1);
    }
    // Auto-stage modified tracked files if -a
    if (autoStage) {
        autoStageModified(repoRoot);
    }
    const entries = (0, index_file_1.readIndex)(repoRoot);
    if (entries.length === 0) {
        console.error('nothing to commit');
        process.exit(1);
    }
    const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
    // Check if there are changes to commit
    if (headCommit && !amend) {
        const headObj = (0, objects_1.readObject)(headCommit, repoRoot);
        const headCommitData = (0, objects_1.parseCommit)(headObj.content);
        const currentTree = buildTree(entries, repoRoot);
        if (currentTree === headCommitData.tree) {
            console.error('nothing to commit, working tree clean');
            process.exit(1);
        }
    }
    // Build tree from index
    const treeSha = buildTree(entries, repoRoot);
    // Get author and committer info
    const author = (0, utils_1.getAuthorInfo)();
    const committer = (0, utils_1.getCommitterInfo)();
    // Build commit
    let parents = [];
    if (amend && headCommit) {
        // Get parent from previous commit
        const prevCommitObj = (0, objects_1.readObject)(headCommit, repoRoot);
        const prevCommit = (0, objects_1.parseCommit)(prevCommitObj.content);
        parents = prevCommit.parents;
        // Use original message if no new message provided
        if (!message) {
            message = prevCommit.message;
        }
    }
    else if (headCommit) {
        parents = [headCommit];
    }
    const commitObj = {
        tree: treeSha,
        parents,
        author: (0, utils_1.formatAuthor)(author.name, author.email, author.date),
        committer: (0, utils_1.formatAuthor)(committer.name, committer.email, committer.date),
        message
    };
    const commitSha = (0, objects_1.writeCommit)(commitObj, repoRoot);
    // Update HEAD
    (0, refs_1.updateHead)(commitSha, repoRoot);
    // Output
    const branch = (0, refs_1.getCurrentBranch)(repoRoot);
    const branchDisplay = branch ? `[${branch} ${(0, utils_1.shortSha)(commitSha)}]` : `[${(0, utils_1.shortSha)(commitSha)}]`;
    console.log(`${branchDisplay} ${message.split('\n')[0]}`);
}
function buildTree(entries, repoRoot) {
    // Group entries by top-level directory
    const tree = new Map();
    for (const entry of entries) {
        const parts = entry.name.split('/');
        const topLevel = parts[0];
        if (parts.length === 1) {
            // File at root level
            if (!tree.has('')) {
                tree.set('', []);
            }
            tree.get('').push({ name: entry.name, sha: entry.sha, mode: entry.mode });
        }
        else {
            // File in subdirectory
            if (!tree.has(topLevel)) {
                tree.set(topLevel, []);
            }
            tree.get(topLevel).push({
                name: parts.slice(1).join('/'),
                sha: entry.sha,
                mode: entry.mode
            });
        }
    }
    // Build tree entries
    const treeEntries = [];
    // First, add root-level files
    const rootFiles = tree.get('') || [];
    for (const file of rootFiles) {
        treeEntries.push({
            mode: file.mode.toString(8).padStart(6, '0'),
            type: 'blob',
            sha: file.sha,
            name: file.name
        });
    }
    // Then, recursively build subtrees
    for (const [dir, subEntries] of tree) {
        if (dir === '')
            continue;
        const subtreeSha = buildTree(subEntries, repoRoot);
        treeEntries.push({
            mode: '040000',
            type: 'tree',
            sha: subtreeSha,
            name: dir
        });
    }
    return (0, objects_1.writeTree)(treeEntries, repoRoot);
}
function autoStageModified(repoRoot) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const newEntries = [];
    for (const entry of entries) {
        const absPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(absPath)) {
            // File deleted - don't include in new index
            continue;
        }
        const stats = fs.statSync(absPath);
        // Check if file was modified
        if (stats.mtimeMs / 1000 !== entry.mtimeSec + entry.mtimeNsec / 1000000000) {
            // Re-read and update entry
            const { writeBlob } = require('../objects');
            const content = fs.readFileSync(absPath);
            const sha = writeBlob(content, repoRoot);
            const mode = (0, utils_1.getFileMode)(absPath);
            newEntries.push({
                ...entry,
                sha,
                mode,
                mtimeSec: Math.floor(stats.mtimeMs / 1000),
                mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
                size: stats.size
            });
        }
        else {
            newEntries.push(entry);
        }
    }
    (0, index_file_1.writeIndex)(newEntries, repoRoot);
}
