"use strict";
// diff command - Show changes
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
exports.diff = diff;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
const diff_algo_1 = require("../diff-algo");
function diff(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let cached = false;
    let showStat = false;
    const paths = [];
    const commits = [];
    let afterDashDash = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            afterDashDash = true;
        }
        else if (afterDashDash) {
            paths.push(arg);
        }
        else if (arg === '--cached' || arg === '--staged') {
            cached = true;
        }
        else if (arg === '--stat') {
            showStat = true;
        }
        else if (!arg.startsWith('-')) {
            // Could be a commit or path
            try {
                (0, refs_1.resolveRevision)(arg, repoRoot);
                commits.push(arg);
            }
            catch {
                paths.push(arg);
            }
        }
    }
    let diffs = [];
    if (commits.length === 2) {
        // diff <commit1> <commit2>
        diffs = diffTwoCommits(commits[0], commits[1], paths, repoRoot);
    }
    else if (commits.length === 1) {
        // diff <commit> - compare working tree with commit
        diffs = diffWorkingTreeWithCommit(commits[0], paths, repoRoot);
    }
    else if (cached) {
        // diff --cached - compare index with HEAD
        diffs = diffIndexWithHead(paths, repoRoot);
    }
    else {
        // diff - compare working tree with index
        diffs = diffWorkingTreeWithIndex(paths, repoRoot);
    }
    // Output
    if (showStat) {
        process.stdout.write((0, diff_algo_1.formatDiffStat)(diffs));
    }
    else {
        for (const d of diffs) {
            process.stdout.write((0, diff_algo_1.formatDiff)(d));
        }
    }
    return 0;
}
function diffWorkingTreeWithIndex(filterPaths, repoRoot) {
    const diffs = [];
    const index = (0, index_file_1.readIndex)(repoRoot);
    for (const entry of index.entries) {
        if (filterPaths.length > 0 && !pathMatches(entry.path, filterPaths)) {
            continue;
        }
        const fullPath = path.join(repoRoot, entry.path);
        if (!fs.existsSync(fullPath)) {
            // Deleted in working tree
            const indexContent = (0, objects_1.getBlob)(entry.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(indexContent)) {
                diffs.push({
                    oldPath: entry.path,
                    newPath: entry.path,
                    hunks: [],
                    isBinary: true,
                });
            }
            else {
                const content = indexContent.toString();
                diffs.push({
                    oldPath: entry.path,
                    newPath: '/dev/null',
                    hunks: (0, diff_algo_1.generateDiff)(content, '', entry.path, entry.path).hunks,
                });
            }
        }
        else {
            const stats = fs.lstatSync(fullPath);
            if (stats.isDirectory())
                continue;
            let workingContent;
            if (stats.isSymbolicLink()) {
                workingContent = Buffer.from(fs.readlinkSync(fullPath));
            }
            else {
                workingContent = fs.readFileSync(fullPath);
            }
            const workingSha = (0, objects_1.hashObject)('blob', workingContent);
            if (workingSha !== entry.sha) {
                const indexContent = (0, objects_1.getBlob)(entry.sha, repoRoot);
                if ((0, utils_1.isBinaryContent)(indexContent) || (0, utils_1.isBinaryContent)(workingContent)) {
                    diffs.push({
                        oldPath: entry.path,
                        newPath: entry.path,
                        hunks: [],
                        isBinary: true,
                    });
                }
                else {
                    const d = (0, diff_algo_1.generateDiff)(indexContent.toString(), workingContent.toString(), entry.path, entry.path);
                    if (d.hunks.length > 0) {
                        diffs.push(d);
                    }
                }
            }
        }
    }
    return diffs;
}
function diffIndexWithHead(filterPaths, repoRoot) {
    const diffs = [];
    const index = (0, index_file_1.readIndex)(repoRoot);
    // Get HEAD tree
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
    // Index files map
    const indexFiles = new Map();
    for (const entry of index.entries) {
        indexFiles.set(entry.path, { sha: entry.sha, mode: entry.mode });
    }
    // Files added or modified in index
    for (const entry of index.entries) {
        if (filterPaths.length > 0 && !pathMatches(entry.path, filterPaths)) {
            continue;
        }
        const headEntry = headFiles.get(entry.path);
        const indexContent = (0, objects_1.getBlob)(entry.sha, repoRoot);
        if (!headEntry) {
            // New file
            if ((0, utils_1.isBinaryContent)(indexContent)) {
                diffs.push({
                    oldPath: '/dev/null',
                    newPath: entry.path,
                    hunks: [],
                    isBinary: true,
                });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)('', indexContent.toString(), '/dev/null', entry.path);
                diffs.push({
                    oldPath: '/dev/null',
                    newPath: entry.path,
                    hunks: d.hunks,
                });
            }
        }
        else if (headEntry.sha !== entry.sha) {
            // Modified
            const headContent = (0, objects_1.getBlob)(headEntry.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(headContent) || (0, utils_1.isBinaryContent)(indexContent)) {
                diffs.push({
                    oldPath: entry.path,
                    newPath: entry.path,
                    hunks: [],
                    isBinary: true,
                });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)(headContent.toString(), indexContent.toString(), entry.path, entry.path);
                if (d.hunks.length > 0) {
                    diffs.push(d);
                }
            }
        }
    }
    // Files deleted in index
    for (const [filePath, headEntry] of headFiles) {
        if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
            continue;
        }
        if (!indexFiles.has(filePath)) {
            const headContent = (0, objects_1.getBlob)(headEntry.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(headContent)) {
                diffs.push({
                    oldPath: filePath,
                    newPath: '/dev/null',
                    hunks: [],
                    isBinary: true,
                });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)(headContent.toString(), '', filePath, '/dev/null');
                diffs.push({
                    oldPath: filePath,
                    newPath: '/dev/null',
                    hunks: d.hunks,
                });
            }
        }
    }
    return diffs;
}
function diffTwoCommits(commit1, commit2, filterPaths, repoRoot) {
    const diffs = [];
    const sha1 = (0, refs_1.resolveRevision)(commit1, repoRoot);
    const sha2 = (0, refs_1.resolveRevision)(commit2, repoRoot);
    const tree1 = (0, objects_1.getTreeFromTreeIsh)(sha1, repoRoot);
    const tree2 = (0, objects_1.getTreeFromTreeIsh)(sha2, repoRoot);
    const files1 = (0, objects_1.walkTree)(tree1, '', repoRoot);
    const files2 = (0, objects_1.walkTree)(tree2, '', repoRoot);
    // All files in both trees
    const allPaths = new Set([...files1.keys(), ...files2.keys()]);
    for (const filePath of allPaths) {
        if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
            continue;
        }
        const entry1 = files1.get(filePath);
        const entry2 = files2.get(filePath);
        if (!entry1) {
            // New in commit2
            const content = (0, objects_1.getBlob)(entry2.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(content)) {
                diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: [], isBinary: true });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)('', content.toString(), '/dev/null', filePath);
                diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: d.hunks });
            }
        }
        else if (!entry2) {
            // Deleted in commit2
            const content = (0, objects_1.getBlob)(entry1.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(content)) {
                diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: [], isBinary: true });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)(content.toString(), '', filePath, '/dev/null');
                diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: d.hunks });
            }
        }
        else if (entry1.sha !== entry2.sha) {
            // Modified
            const content1 = (0, objects_1.getBlob)(entry1.sha, repoRoot);
            const content2 = (0, objects_1.getBlob)(entry2.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(content1) || (0, utils_1.isBinaryContent)(content2)) {
                diffs.push({ oldPath: filePath, newPath: filePath, hunks: [], isBinary: true });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)(content1.toString(), content2.toString(), filePath, filePath);
                if (d.hunks.length > 0) {
                    diffs.push(d);
                }
            }
        }
    }
    return diffs;
}
function diffWorkingTreeWithCommit(commit, filterPaths, repoRoot) {
    const diffs = [];
    const sha = (0, refs_1.resolveRevision)(commit, repoRoot);
    const treeSha = (0, objects_1.getTreeFromTreeIsh)(sha, repoRoot);
    const commitFiles = (0, objects_1.walkTree)(treeSha, '', repoRoot);
    // Working tree files
    const workingFiles = new Map();
    collectWorkingFilesWithContent(repoRoot, repoRoot, workingFiles);
    // All paths
    const allPaths = new Set([...commitFiles.keys(), ...workingFiles.keys()]);
    for (const filePath of allPaths) {
        if (filterPaths.length > 0 && !pathMatches(filePath, filterPaths)) {
            continue;
        }
        const commitEntry = commitFiles.get(filePath);
        const workingEntry = workingFiles.get(filePath);
        if (!commitEntry) {
            // New in working tree
            const content = workingEntry.content;
            if ((0, utils_1.isBinaryContent)(content)) {
                diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: [], isBinary: true });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)('', content.toString(), '/dev/null', filePath);
                diffs.push({ oldPath: '/dev/null', newPath: filePath, hunks: d.hunks });
            }
        }
        else if (!workingEntry) {
            // Deleted in working tree
            const content = (0, objects_1.getBlob)(commitEntry.sha, repoRoot);
            if ((0, utils_1.isBinaryContent)(content)) {
                diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: [], isBinary: true });
            }
            else {
                const d = (0, diff_algo_1.generateDiff)(content.toString(), '', filePath, '/dev/null');
                diffs.push({ oldPath: filePath, newPath: '/dev/null', hunks: d.hunks });
            }
        }
        else {
            // Compare
            const commitContent = (0, objects_1.getBlob)(commitEntry.sha, repoRoot);
            const workingContent = workingEntry.content;
            const workingSha = (0, objects_1.hashObject)('blob', workingContent);
            if (workingSha !== commitEntry.sha) {
                if ((0, utils_1.isBinaryContent)(commitContent) || (0, utils_1.isBinaryContent)(workingContent)) {
                    diffs.push({ oldPath: filePath, newPath: filePath, hunks: [], isBinary: true });
                }
                else {
                    const d = (0, diff_algo_1.generateDiff)(commitContent.toString(), workingContent.toString(), filePath, filePath);
                    if (d.hunks.length > 0) {
                        diffs.push(d);
                    }
                }
            }
        }
    }
    return diffs;
}
function collectWorkingFilesWithContent(dir, repoRoot, result) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectWorkingFilesWithContent(fullPath, repoRoot, result);
        }
        else {
            const relativePath = (0, utils_1.normalizePath)(path.relative(repoRoot, fullPath));
            const stats = fs.lstatSync(fullPath);
            let content;
            if (stats.isSymbolicLink()) {
                content = Buffer.from(fs.readlinkSync(fullPath));
            }
            else {
                content = fs.readFileSync(fullPath);
            }
            result.set(relativePath, { content });
        }
    }
}
function pathMatches(filePath, filterPaths) {
    for (const filter of filterPaths) {
        if (filePath === filter || filePath.startsWith(filter + '/')) {
            return true;
        }
    }
    return false;
}
