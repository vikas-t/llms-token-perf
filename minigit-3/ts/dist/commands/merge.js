"use strict";
// merge command - Merge branches
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
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let noCommit = false;
    let abort = false;
    let branchName = null;
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--no-commit') {
            noCommit = true;
        }
        else if (arg === '--abort') {
            abort = true;
        }
        else if (!arg.startsWith('-')) {
            branchName = arg;
        }
    }
    if (abort) {
        // Abort merge
        abortMerge(repoRoot);
        return;
    }
    if (!branchName) {
        console.error('fatal: specify a branch to merge');
        process.exit(1);
    }
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (!headSha) {
        console.error('fatal: HEAD does not point to a valid commit');
        process.exit(1);
    }
    const mergeSha = (0, refs_1.resolveRef)(branchName, repoRoot);
    if (!mergeSha) {
        console.error(`merge: ${branchName} - not something we can merge`);
        process.exit(1);
    }
    // Check if already up to date
    if (headSha === mergeSha) {
        console.log('Already up to date.');
        return;
    }
    // Check if merge commit is ancestor of HEAD
    if (isAncestor(mergeSha, headSha, repoRoot)) {
        console.log('Already up to date.');
        return;
    }
    // Check for fast-forward
    if (isAncestor(headSha, mergeSha, repoRoot)) {
        fastForwardMerge(mergeSha, branchName, noCommit, repoRoot);
        return;
    }
    // Find merge base
    const mergeBase = findMergeBase(headSha, mergeSha, repoRoot);
    if (!mergeBase) {
        console.error('fatal: refusing to merge unrelated histories');
        process.exit(1);
    }
    // Perform three-way merge
    const result = threeWayMerge(mergeBase, headSha, mergeSha, branchName, repoRoot);
    if (result.conflicts.length > 0) {
        console.error('CONFLICT (content): Merge conflict in the following files:');
        for (const file of result.conflicts) {
            console.error(`  ${file}`);
        }
        console.error('Automatic merge failed; fix conflicts and then commit the result.');
        process.exit(1);
    }
    if (noCommit) {
        console.log(`Automatic merge went well; stopped before committing as requested`);
        return;
    }
    // Create merge commit
    const author = (0, utils_1.getAuthorInfo)();
    const committer = (0, utils_1.getCommitterInfo)();
    const commitObj = {
        tree: result.treeSha,
        parents: [headSha, mergeSha],
        author: (0, utils_1.formatAuthor)(author.name, author.email, author.date),
        committer: (0, utils_1.formatAuthor)(committer.name, committer.email, committer.date),
        message: `Merge branch '${branchName}'`
    };
    const commitSha = (0, objects_1.writeCommit)(commitObj, repoRoot);
    (0, refs_1.updateHead)(commitSha, repoRoot);
    console.log(`Merge made by the 'ort' strategy.`);
}
function fastForwardMerge(targetSha, branchName, noCommit, repoRoot) {
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    const headCommit = headSha ? (0, objects_1.parseCommit)((0, objects_1.readObject)(headSha, repoRoot).content) : null;
    const headFiles = new Map();
    if (headCommit) {
        collectTreeFilesWithMode(headCommit.tree, '', repoRoot, headFiles);
    }
    const targetCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(targetSha, repoRoot).content);
    const targetFiles = new Map();
    collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);
    // Update files in working tree
    for (const [name, entry] of targetFiles) {
        const absPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(absPath));
        const obj = (0, objects_1.readObject)(entry.sha, repoRoot);
        fs.writeFileSync(absPath, obj.content);
        if (entry.mode === 0o100755) {
            fs.chmodSync(absPath, 0o755);
        }
    }
    // Update index
    const newEntries = [];
    for (const [name, entry] of targetFiles) {
        const absPath = path.join(repoRoot, name);
        const stats = fs.statSync(absPath);
        newEntries.push({
            ctimeSec: Math.floor(stats.ctimeMs / 1000),
            ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
            mtimeSec: Math.floor(stats.mtimeMs / 1000),
            mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
            dev: stats.dev,
            ino: stats.ino,
            mode: entry.mode,
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
            sha: entry.sha,
            flags: Math.min(name.length, 0xfff),
            name
        });
    }
    (0, index_file_1.writeIndex)(newEntries, repoRoot);
    if (noCommit) {
        console.log(`Automatic merge went well; stopped before committing as requested`);
    }
    else {
        (0, refs_1.updateHead)(targetSha, repoRoot);
        console.log(`Fast-forward`);
    }
}
function threeWayMerge(baseSha, oursSha, theirsSha, branchName, repoRoot) {
    const baseFiles = new Map();
    const oursFiles = new Map();
    const theirsFiles = new Map();
    const baseCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(baseSha, repoRoot).content);
    const oursCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(oursSha, repoRoot).content);
    const theirsCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(theirsSha, repoRoot).content);
    collectTreeFilesWithMode(baseCommit.tree, '', repoRoot, baseFiles);
    collectTreeFilesWithMode(oursCommit.tree, '', repoRoot, oursFiles);
    collectTreeFilesWithMode(theirsCommit.tree, '', repoRoot, theirsFiles);
    const allPaths = new Set([...baseFiles.keys(), ...oursFiles.keys(), ...theirsFiles.keys()]);
    const conflicts = [];
    const mergedEntries = [];
    for (const name of allPaths) {
        const baseEntry = baseFiles.get(name);
        const oursEntry = oursFiles.get(name);
        const theirsEntry = theirsFiles.get(name);
        const baseContent = baseEntry ? (0, objects_1.readObject)(baseEntry.sha, repoRoot).content.toString() : null;
        const oursContent = oursEntry ? (0, objects_1.readObject)(oursEntry.sha, repoRoot).content.toString() : null;
        const theirsContent = theirsEntry ? (0, objects_1.readObject)(theirsEntry.sha, repoRoot).content.toString() : null;
        // Simple cases
        if (oursContent === theirsContent) {
            if (oursContent !== null) {
                mergedEntries.push({ name, sha: oursEntry.sha, mode: oursEntry.mode });
            }
            continue;
        }
        if (baseContent === oursContent && theirsContent !== null) {
            // Only theirs changed
            mergedEntries.push({ name, sha: theirsEntry.sha, mode: theirsEntry.mode });
            updateFile(name, theirsEntry.sha, theirsEntry.mode, repoRoot);
            continue;
        }
        if (baseContent === theirsContent && oursContent !== null) {
            // Only ours changed
            mergedEntries.push({ name, sha: oursEntry.sha, mode: oursEntry.mode });
            continue;
        }
        // Both changed - try three-way merge
        const mergeResult = (0, merge_algo_1.mergeFiles)(baseContent, oursContent, theirsContent, branchName);
        if (!mergeResult.success) {
            conflicts.push(name);
        }
        // Write merged content
        const mergedBuffer = Buffer.from(mergeResult.mergedContent || '');
        const mergedSha = (0, objects_1.writeBlob)(mergedBuffer, repoRoot);
        const mode = oursEntry?.mode || theirsEntry?.mode || 0o100644;
        mergedEntries.push({ name, sha: mergedSha, mode });
        // Update working tree
        const absPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(absPath));
        fs.writeFileSync(absPath, mergeResult.mergedContent || '');
    }
    // Build tree from merged entries
    const treeSha = buildTree(mergedEntries, repoRoot);
    // Update index
    const newIndexEntries = [];
    for (const entry of mergedEntries) {
        const absPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(absPath))
            continue;
        const stats = fs.statSync(absPath);
        newIndexEntries.push({
            ctimeSec: Math.floor(stats.ctimeMs / 1000),
            ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
            mtimeSec: Math.floor(stats.mtimeMs / 1000),
            mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
            dev: stats.dev,
            ino: stats.ino,
            mode: entry.mode,
            uid: stats.uid,
            gid: stats.gid,
            size: stats.size,
            sha: entry.sha,
            flags: Math.min(entry.name.length, 0xfff),
            name: entry.name
        });
    }
    (0, index_file_1.writeIndex)(newIndexEntries, repoRoot);
    return { treeSha, conflicts };
}
function updateFile(name, sha, mode, repoRoot) {
    const absPath = path.join(repoRoot, name);
    (0, utils_1.ensureDir)(path.dirname(absPath));
    const obj = (0, objects_1.readObject)(sha, repoRoot);
    fs.writeFileSync(absPath, obj.content);
    if (mode === 0o100755) {
        fs.chmodSync(absPath, 0o755);
    }
}
function buildTree(entries, repoRoot) {
    const tree = new Map();
    for (const entry of entries) {
        const parts = entry.name.split('/');
        const topLevel = parts[0];
        if (parts.length === 1) {
            if (!tree.has(''))
                tree.set('', []);
            tree.get('').push({ name: entry.name, sha: entry.sha, mode: entry.mode });
        }
        else {
            if (!tree.has(topLevel))
                tree.set(topLevel, []);
            tree.get(topLevel).push({
                name: parts.slice(1).join('/'),
                sha: entry.sha,
                mode: entry.mode
            });
        }
    }
    const treeEntries = [];
    const rootFiles = tree.get('') || [];
    for (const file of rootFiles) {
        treeEntries.push({
            mode: file.mode.toString(8).padStart(6, '0'),
            type: 'blob',
            sha: file.sha,
            name: file.name
        });
    }
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
function isAncestor(commitSha, headSha, repoRoot) {
    const visited = new Set();
    const queue = [headSha];
    while (queue.length > 0) {
        const sha = queue.shift();
        if (sha === commitSha)
            return true;
        if (visited.has(sha))
            continue;
        visited.add(sha);
        try {
            const obj = (0, objects_1.readObject)(sha, repoRoot);
            if (obj.type === 'commit') {
                const commit = (0, objects_1.parseCommit)(obj.content);
                queue.push(...commit.parents);
            }
        }
        catch {
            // Ignore errors
        }
    }
    return false;
}
function findMergeBase(sha1, sha2, repoRoot) {
    // Get all ancestors of sha1
    const ancestors1 = new Set();
    const queue1 = [sha1];
    while (queue1.length > 0) {
        const sha = queue1.shift();
        if (ancestors1.has(sha))
            continue;
        ancestors1.add(sha);
        try {
            const obj = (0, objects_1.readObject)(sha, repoRoot);
            if (obj.type === 'commit') {
                const commit = (0, objects_1.parseCommit)(obj.content);
                queue1.push(...commit.parents);
            }
        }
        catch {
            // Ignore errors
        }
    }
    // Find first common ancestor from sha2
    const queue2 = [sha2];
    const visited = new Set();
    while (queue2.length > 0) {
        const sha = queue2.shift();
        if (visited.has(sha))
            continue;
        visited.add(sha);
        if (ancestors1.has(sha)) {
            return sha;
        }
        try {
            const obj = (0, objects_1.readObject)(sha, repoRoot);
            if (obj.type === 'commit') {
                const commit = (0, objects_1.parseCommit)(obj.content);
                queue2.push(...commit.parents);
            }
        }
        catch {
            // Ignore errors
        }
    }
    return null;
}
function abortMerge(repoRoot) {
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (!headSha) {
        console.error('fatal: no merge in progress');
        process.exit(1);
    }
    // Reset to HEAD
    const commit = (0, objects_1.parseCommit)((0, objects_1.readObject)(headSha, repoRoot).content);
    const files = new Map();
    collectTreeFilesWithMode(commit.tree, '', repoRoot, files);
    for (const [name, entry] of files) {
        const absPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(absPath));
        const obj = (0, objects_1.readObject)(entry.sha, repoRoot);
        fs.writeFileSync(absPath, obj.content);
    }
    console.log('Merge aborted.');
}
function collectTreeFilesWithMode(treeSha, prefix, repoRoot, files) {
    const treeObj = (0, objects_1.readObject)(treeSha, repoRoot);
    const entries = (0, objects_1.parseTree)(treeObj.content);
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.type === 'tree') {
            collectTreeFilesWithMode(entry.sha, name, repoRoot, files);
        }
        else {
            files.set(name, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
        }
    }
}
