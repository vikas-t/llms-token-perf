"use strict";
// merge command - Merge branch into current branch
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
exports.merge = merge;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
const merge_algo_1 = require("../merge-algo");
function merge(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let noCommit = false;
    let abortMerge = false;
    let targetBranch = null;
    for (const arg of args) {
        if (arg === '--no-commit') {
            noCommit = true;
        }
        else if (arg === '--abort') {
            abortMerge = true;
        }
        else if (!arg.startsWith('-')) {
            targetBranch = arg;
        }
    }
    // Handle abort
    if (abortMerge) {
        const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
        if (fs.existsSync(mergeHeadPath)) {
            // Reset to HEAD
            const headSha = (0, refs_1.getHeadCommit)(repoRoot);
            if (headSha) {
                // Reset working tree and index to HEAD
                const treeSha = (0, objects_1.getTreeFromTreeIsh)(headSha, repoRoot);
                resetToTree(treeSha, repoRoot);
            }
            fs.unlinkSync(mergeHeadPath);
            const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');
            if (fs.existsSync(mergeMsgPath)) {
                fs.unlinkSync(mergeMsgPath);
            }
            console.log('Merge aborted.');
            return 0;
        }
        else {
            console.error('error: There is no merge in progress');
            return 1;
        }
    }
    if (!targetBranch) {
        console.error('fatal: no branch specified');
        return 1;
    }
    // Resolve target
    let targetSha;
    try {
        // Try as branch first
        const branchSha = (0, refs_1.resolveRef)(`refs/heads/${targetBranch}`, repoRoot);
        if (branchSha) {
            targetSha = branchSha;
        }
        else {
            targetSha = (0, refs_1.resolveRevision)(targetBranch, repoRoot);
        }
    }
    catch (e) {
        console.error(`merge: ${targetBranch} - not something we can merge`);
        return 1;
    }
    // Get current HEAD
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (!headSha) {
        console.error('fatal: HEAD does not point to a valid commit');
        return 1;
    }
    // Check if already up to date
    if (headSha === targetSha) {
        console.log('Already up to date.');
        return 0;
    }
    // Check if target is ancestor of HEAD (already merged)
    if (isAncestor(targetSha, headSha, repoRoot)) {
        console.log('Already up to date.');
        return 0;
    }
    // Check if HEAD is ancestor of target (fast-forward possible)
    if (isAncestor(headSha, targetSha, repoRoot)) {
        // Fast-forward
        const result = updateWorkingTree(targetSha, repoRoot);
        if (result !== 0)
            return result;
        if (!noCommit) {
            const branch = (0, refs_1.getCurrentBranch)(repoRoot);
            if (branch) {
                (0, refs_1.updateRef)(`refs/heads/${branch}`, targetSha, repoRoot);
            }
            else {
                (0, refs_1.setHead)(targetSha, repoRoot);
            }
            console.log(`Updating ${headSha.slice(0, 7)}..${targetSha.slice(0, 7)}`);
            console.log('Fast-forward');
        }
        else {
            // For --no-commit, save merge state so status shows changes
            const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
            fs.writeFileSync(mergeHeadPath, targetSha + '\n');
        }
        return 0;
    }
    // Three-way merge
    const mergeBase = (0, merge_algo_1.findMergeBase)(headSha, targetSha, repoRoot);
    if (!mergeBase) {
        console.error('fatal: refusing to merge unrelated histories');
        return 1;
    }
    // Get trees
    const baseTree = (0, objects_1.getTreeFromTreeIsh)(mergeBase, repoRoot);
    const headTree = (0, objects_1.getTreeFromTreeIsh)(headSha, repoRoot);
    const targetTree = (0, objects_1.getTreeFromTreeIsh)(targetSha, repoRoot);
    const baseFiles = (0, objects_1.walkTree)(baseTree, '', repoRoot);
    const headFiles = (0, objects_1.walkTree)(headTree, '', repoRoot);
    const targetFiles = (0, objects_1.walkTree)(targetTree, '', repoRoot);
    // Collect all files
    const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys(), ...targetFiles.keys()]);
    const conflicts = [];
    const mergedEntries = [];
    for (const filePath of allPaths) {
        const baseEntry = baseFiles.get(filePath);
        const headEntry = headFiles.get(filePath);
        const targetEntry = targetFiles.get(filePath);
        // Skip if unchanged
        if (headEntry && targetEntry && headEntry.sha === targetEntry.sha) {
            mergedEntries.push({ path: filePath, sha: headEntry.sha, mode: headEntry.mode });
            continue;
        }
        // File only in HEAD (not in target)
        if (headEntry && !targetEntry) {
            if (!baseEntry) {
                // New in HEAD, keep it
                mergedEntries.push({ path: filePath, sha: headEntry.sha, mode: headEntry.mode });
            }
            else if (baseEntry.sha === headEntry.sha) {
                // Deleted in target, unchanged in HEAD - delete
                // Don't add to merged
            }
            else {
                // Modified in HEAD, deleted in target - conflict
                conflicts.push(filePath);
                mergedEntries.push({ path: filePath, sha: headEntry.sha, mode: headEntry.mode });
            }
            continue;
        }
        // File only in target (not in HEAD)
        if (targetEntry && !headEntry) {
            if (!baseEntry) {
                // New in target, add it
                mergedEntries.push({ path: filePath, sha: targetEntry.sha, mode: targetEntry.mode });
            }
            else if (baseEntry.sha === targetEntry.sha) {
                // Deleted in HEAD, unchanged in target - delete
                // Don't add to merged
            }
            else {
                // Modified in target, deleted in HEAD - conflict
                conflicts.push(filePath);
                mergedEntries.push({ path: filePath, sha: targetEntry.sha, mode: targetEntry.mode });
            }
            continue;
        }
        // Both have the file
        if (headEntry && targetEntry) {
            if (!baseEntry) {
                // New in both - need to merge
                const headContent = (0, objects_1.getBlob)(headEntry.sha, repoRoot).toString();
                const targetContent = (0, objects_1.getBlob)(targetEntry.sha, repoRoot).toString();
                if (headContent === targetContent) {
                    mergedEntries.push({ path: filePath, sha: headEntry.sha, mode: headEntry.mode });
                }
                else {
                    // Conflict
                    const merged = (0, merge_algo_1.mergeFiles)(null, headContent, targetContent, 'HEAD', targetBranch);
                    const sha = (0, objects_1.createBlob)(Buffer.from(merged.mergedContent || ''), true, repoRoot);
                    mergedEntries.push({ path: filePath, sha, mode: headEntry.mode });
                    if (!merged.success) {
                        conflicts.push(filePath);
                    }
                }
                continue;
            }
            // Modified in one or both
            const baseContent = (0, objects_1.getBlob)(baseEntry.sha, repoRoot).toString();
            const headContent = (0, objects_1.getBlob)(headEntry.sha, repoRoot).toString();
            const targetContent = (0, objects_1.getBlob)(targetEntry.sha, repoRoot).toString();
            if (baseEntry.sha === headEntry.sha) {
                // Only modified in target
                mergedEntries.push({ path: filePath, sha: targetEntry.sha, mode: targetEntry.mode });
            }
            else if (baseEntry.sha === targetEntry.sha) {
                // Only modified in HEAD
                mergedEntries.push({ path: filePath, sha: headEntry.sha, mode: headEntry.mode });
            }
            else {
                // Modified in both - need three-way merge
                const merged = (0, merge_algo_1.mergeFiles)(baseContent, headContent, targetContent, 'HEAD', targetBranch);
                const sha = (0, objects_1.createBlob)(Buffer.from(merged.mergedContent || ''), true, repoRoot);
                mergedEntries.push({ path: filePath, sha, mode: headEntry.mode });
                if (!merged.success) {
                    conflicts.push(filePath);
                }
            }
        }
    }
    // Write merged files to working tree and index
    const index = (0, index_file_1.readIndex)(repoRoot);
    index.entries = [];
    for (const entry of mergedEntries) {
        const fullPath = path.join(repoRoot, entry.path);
        (0, utils_1.ensureDir)(path.dirname(fullPath));
        const content = (0, objects_1.getBlob)(entry.sha, repoRoot);
        fs.writeFileSync(fullPath, content);
        if (entry.mode === '100755') {
            fs.chmodSync(fullPath, 0o755);
        }
        const stats = fs.statSync(fullPath);
        const indexEntry = {
            ctimeSec: Math.floor(stats.ctimeMs / 1000),
            ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
            mtimeSec: Math.floor(stats.mtimeMs / 1000),
            mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
            dev: stats.dev,
            ino: stats.ino,
            mode: parseInt(entry.mode, 8),
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
            sha: entry.sha,
            flags: Math.min(entry.path.length, 0xfff),
            path: entry.path,
        };
        index.entries.push(indexEntry);
    }
    (0, index_file_1.writeIndex)(index, repoRoot);
    // Delete files not in merged set
    const headFilesSet = new Set(headFiles.keys());
    for (const filePath of headFilesSet) {
        if (!mergedEntries.find(e => e.path === filePath)) {
            const fullPath = path.join(repoRoot, filePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }
    }
    // Handle conflicts
    if (conflicts.length > 0) {
        // Save merge state
        const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
        fs.writeFileSync(mergeHeadPath, targetSha + '\n');
        const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');
        fs.writeFileSync(mergeMsgPath, `Merge branch '${targetBranch}'\n\nConflicts:\n${conflicts.map(c => `\t${c}`).join('\n')}\n`);
        console.error('Auto-merging failed; fix conflicts and then commit the result.');
        console.error('Automatic merge failed; fix conflicts and then commit the result.');
        return 1;
    }
    // Create merge commit (unless --no-commit)
    if (!noCommit) {
        // Build tree from index
        const treeSha = buildTreeFromEntries(mergedEntries, repoRoot);
        // Create merge commit
        const authorInfo = (0, utils_1.getAuthorInfo)();
        const committerInfo = (0, utils_1.getCommitterInfo)();
        const author = (0, utils_1.formatAuthorDate)(authorInfo.name, authorInfo.email, authorInfo.date, authorInfo.tz);
        const committer = (0, utils_1.formatAuthorDate)(committerInfo.name, committerInfo.email, committerInfo.date, committerInfo.tz);
        const message = `Merge branch '${targetBranch}'`;
        const commitSha = (0, objects_1.createCommit)(treeSha, [headSha, targetSha], author, committer, message, repoRoot);
        // Update ref
        const branch = (0, refs_1.getCurrentBranch)(repoRoot);
        if (branch) {
            (0, refs_1.updateRef)(`refs/heads/${branch}`, commitSha, repoRoot);
        }
        else {
            (0, refs_1.setHead)(commitSha, repoRoot);
        }
        console.log(`Merge made by the 'ort' strategy.`);
    }
    return 0;
}
function isAncestor(ancestor, descendant, repoRoot) {
    const visited = new Set();
    const queue = [descendant];
    while (queue.length > 0) {
        const sha = queue.shift();
        if (visited.has(sha))
            continue;
        visited.add(sha);
        if (sha === ancestor)
            return true;
        try {
            const commit = (0, objects_1.getCommit)(sha, repoRoot);
            queue.push(...commit.parents);
        }
        catch {
            // Invalid
        }
    }
    return false;
}
function updateWorkingTree(targetSha, repoRoot) {
    const targetTree = (0, objects_1.getTreeFromTreeIsh)(targetSha, repoRoot);
    resetToTree(targetTree, repoRoot);
    return 0;
}
function resetToTree(treeSha, repoRoot) {
    const files = (0, objects_1.walkTree)(treeSha, '', repoRoot);
    const index = (0, index_file_1.readIndex)(repoRoot);
    // Remove files not in tree
    const currentFiles = new Set();
    collectCurrentFiles(repoRoot, repoRoot, currentFiles);
    for (const filePath of currentFiles) {
        if (!files.has(filePath)) {
            const fullPath = path.join(repoRoot, filePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }
    }
    // Write files from tree
    index.entries = [];
    for (const [filePath, entry] of files) {
        const fullPath = path.join(repoRoot, filePath);
        (0, utils_1.ensureDir)(path.dirname(fullPath));
        const content = (0, objects_1.getBlob)(entry.sha, repoRoot);
        fs.writeFileSync(fullPath, content);
        if (entry.mode === '100755') {
            fs.chmodSync(fullPath, 0o755);
        }
        const stats = fs.statSync(fullPath);
        const indexEntry = {
            ctimeSec: Math.floor(stats.ctimeMs / 1000),
            ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
            mtimeSec: Math.floor(stats.mtimeMs / 1000),
            mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
            dev: stats.dev,
            ino: stats.ino,
            mode: parseInt(entry.mode, 8),
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
            sha: entry.sha,
            flags: Math.min(filePath.length, 0xfff),
            path: filePath,
        };
        index.entries.push(indexEntry);
    }
    (0, index_file_1.writeIndex)(index, repoRoot);
}
function collectCurrentFiles(dir, repoRoot, result) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === '.minigit')
                continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                collectCurrentFiles(fullPath, repoRoot, result);
            }
            else {
                const relativePath = path.relative(repoRoot, fullPath).split(path.sep).join('/');
                result.add(relativePath);
            }
        }
    }
    catch {
        // Ignore errors
    }
}
function buildTreeFromEntries(entries, repoRoot) {
    // Group by directory
    const root = new Map();
    for (const entry of entries) {
        const parts = entry.path.split('/');
        let current = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current.has(parts[i])) {
                current.set(parts[i], new Map());
            }
            current = current.get(parts[i]);
        }
        current.set(parts[parts.length - 1], { sha: entry.sha, mode: entry.mode });
    }
    return buildTreeRecursive(root, repoRoot);
}
function buildTreeRecursive(dir, repoRoot) {
    const treeEntries = [];
    for (const [name, value] of dir) {
        if (value instanceof Map) {
            // Directory
            const subTreeSha = buildTreeRecursive(value, repoRoot);
            treeEntries.push({ mode: '40000', name, sha: subTreeSha });
        }
        else {
            // File
            treeEntries.push({ mode: value.mode, name, sha: value.sha });
        }
    }
    return (0, objects_1.createTree)(treeEntries, repoRoot);
}
