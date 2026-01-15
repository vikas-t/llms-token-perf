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
        console.error('fatal: not a git repository');
        process.exit(1);
    }
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
    const entries = getStatusEntries(repoRoot);
    if (shortFormat || porcelain) {
        printShortStatus(entries);
    }
    else {
        printLongStatus(entries, repoRoot);
    }
}
function getStatusEntries(repoRoot) {
    const indexEntries = (0, index_file_1.readIndex)(repoRoot);
    const indexMap = new Map(indexEntries.map(e => [e.name, e]));
    const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
    // Get HEAD tree files
    const headFiles = new Map();
    if (headCommit) {
        const commitObj = (0, objects_1.readObject)(headCommit, repoRoot);
        const commit = (0, objects_1.parseCommit)(commitObj.content);
        collectTreeFiles(commit.tree, '', repoRoot, headFiles);
    }
    // Collect working directory files
    const workingFiles = new Set();
    collectWorkingFiles(repoRoot, '', repoRoot, workingFiles);
    const result = [];
    const seen = new Set();
    // Check index entries
    for (const [name, entry] of indexMap) {
        seen.add(name);
        const headEntry = headFiles.get(name);
        const workPath = path.join(repoRoot, name);
        const exists = fs.existsSync(workPath);
        let indexStatus = ' ';
        let workStatus = ' ';
        // Index vs HEAD status
        if (!headEntry) {
            indexStatus = 'A'; // Added to index
        }
        else if (headEntry.sha !== entry.sha) {
            indexStatus = 'M'; // Modified in index
        }
        // Working tree vs index status
        if (!exists) {
            workStatus = 'D'; // Deleted from working tree
        }
        else {
            const stats = fs.statSync(workPath);
            if (stats.isFile()) {
                const content = fs.readFileSync(workPath);
                const { sha1 } = require('../utils');
                const header = `blob ${content.length}\0`;
                const fullContent = Buffer.concat([Buffer.from(header), content]);
                const workSha = sha1(fullContent);
                if (workSha !== entry.sha) {
                    workStatus = 'M'; // Modified in working tree
                }
            }
        }
        if (indexStatus !== ' ' || workStatus !== ' ') {
            result.push({ path: name, indexStatus, workStatus });
        }
    }
    // Check HEAD files not in index (staged deletions)
    for (const [name, entry] of headFiles) {
        if (!seen.has(name) && !indexMap.has(name)) {
            seen.add(name);
            result.push({ path: name, indexStatus: 'D', workStatus: ' ' });
        }
    }
    // Check untracked files
    for (const name of workingFiles) {
        if (!seen.has(name) && !indexMap.has(name)) {
            result.push({ path: name, indexStatus: '?', workStatus: '?' });
        }
    }
    // Sort by path
    result.sort((a, b) => a.path.localeCompare(b.path));
    return result;
}
function collectTreeFiles(treeSha, prefix, repoRoot, files) {
    const treeObj = (0, objects_1.readObject)(treeSha, repoRoot);
    const entries = (0, objects_1.parseTree)(treeObj.content);
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.type === 'tree') {
            collectTreeFiles(entry.sha, name, repoRoot, files);
        }
        else {
            files.set(name, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
        }
    }
}
function collectWorkingFiles(dir, prefix, repoRoot, files) {
    if (!fs.existsSync(dir))
        return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.minigit')
            continue;
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            collectWorkingFiles(path.join(dir, entry.name), name, repoRoot, files);
        }
        else if (entry.isFile() || entry.isSymbolicLink()) {
            files.add(name);
        }
    }
}
function printShortStatus(entries) {
    for (const entry of entries) {
        console.log(`${entry.indexStatus}${entry.workStatus} ${entry.path}`);
    }
}
function printLongStatus(entries, repoRoot) {
    const branch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (branch) {
        console.log(`On branch ${branch}`);
    }
    else if ((0, refs_1.isHeadDetached)(repoRoot)) {
        console.log('HEAD detached');
    }
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const entry of entries) {
        if (entry.indexStatus === '?') {
            untracked.push(entry);
        }
        else if (entry.indexStatus !== ' ') {
            staged.push(entry);
        }
        if (entry.workStatus !== ' ' && entry.workStatus !== '?') {
            unstaged.push(entry);
        }
    }
    if (staged.length > 0) {
        console.log('\nChanges to be committed:');
        console.log('  (use "git restore --staged <file>..." to unstage)');
        for (const entry of staged) {
            const status = getStatusLabel(entry.indexStatus);
            console.log(`\t${status}:   ${entry.path}`);
        }
    }
    if (unstaged.length > 0) {
        console.log('\nChanges not staged for commit:');
        console.log('  (use "git add <file>..." to update what will be committed)');
        for (const entry of unstaged) {
            const status = getStatusLabel(entry.workStatus);
            console.log(`\t${status}:   ${entry.path}`);
        }
    }
    if (untracked.length > 0) {
        console.log('\nUntracked files:');
        console.log('  (use "git add <file>..." to include in what will be committed)');
        for (const entry of untracked) {
            console.log(`\t${entry.path}`);
        }
    }
    if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
        console.log('\nnothing to commit, working tree clean');
    }
    else if (staged.length === 0) {
        console.log('\nno changes added to commit');
    }
}
function getStatusLabel(code) {
    switch (code) {
        case 'A': return 'new file';
        case 'M': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        default: return 'unknown';
    }
}
