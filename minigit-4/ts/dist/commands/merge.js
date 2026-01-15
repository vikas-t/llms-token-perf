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
const objects_1 = require("../objects");
const refs_1 = require("../refs");
const merge_algo_1 = require("../merge-algo");
function merge(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let noCommit = false;
    let abort = false;
    let branchName = null;
    for (const arg of args) {
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
        return abortMerge(repoRoot);
    }
    if (!branchName) {
        console.error('fatal: branch name required');
        return 1;
    }
    // Resolve branch to commit
    const theirsSha = (0, refs_1.resolveRevision)(repoRoot, branchName);
    if (!theirsSha) {
        console.error(`fatal: '${branchName}' is not a valid branch name`);
        return 1;
    }
    const oursSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (!oursSha) {
        console.error('fatal: HEAD does not point to a valid commit');
        return 1;
    }
    // Check if already up to date
    if (oursSha === theirsSha) {
        console.log('Already up to date.');
        return 0;
    }
    // Check if fast-forward is possible
    if (isAncestor(repoRoot, oursSha, theirsSha)) {
        // Fast-forward
        return fastForwardMerge(repoRoot, theirsSha, branchName, noCommit);
    }
    // Check if theirs is ancestor of ours (already merged)
    if (isAncestor(repoRoot, theirsSha, oursSha)) {
        console.log('Already up to date.');
        return 0;
    }
    // Find merge base
    const baseSha = (0, merge_algo_1.findMergeBase)(repoRoot, oursSha, theirsSha, (sha) => getParents(repoRoot, sha));
    if (!baseSha) {
        console.error('fatal: cannot find merge base');
        return 1;
    }
    // Perform three-way merge
    return performMerge(repoRoot, baseSha, oursSha, theirsSha, branchName, noCommit);
}
function fastForwardMerge(repoRoot, theirsSha, branchName, noCommit = false) {
    const originalHead = (0, refs_1.getHeadCommit)(repoRoot);
    // Update working tree and index
    updateWorkingTreeToCommit(repoRoot, theirsSha);
    if (noCommit) {
        // For --no-commit, we need to stage changes but not update the branch
        // Reset the branch back to original, but keep working tree and index
        const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
        if (currentBranch && originalHead) {
            (0, refs_1.updateBranch)(repoRoot, currentBranch, originalHead);
        }
        else if (originalHead) {
            (0, refs_1.writeHead)(repoRoot, originalHead);
        }
        console.log('Automatic merge went well; stopped before committing as requested');
        return 0;
    }
    // Update branch
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (currentBranch) {
        (0, refs_1.updateBranch)(repoRoot, currentBranch, theirsSha);
    }
    else {
        (0, refs_1.writeHead)(repoRoot, theirsSha);
    }
    console.log(`Updating ${(0, utils_1.shortSha)(originalHead || '')}..${(0, utils_1.shortSha)(theirsSha)}`);
    console.log('Fast-forward');
    return 0;
}
function performMerge(repoRoot, baseSha, oursSha, theirsSha, branchName, noCommit) {
    // Get tree files for all three commits
    const baseFiles = getTreeFiles(repoRoot, baseSha);
    const oursFiles = getTreeFiles(repoRoot, oursSha);
    const theirsFiles = getTreeFiles(repoRoot, theirsSha);
    // Collect all file paths
    const allPaths = new Set([...baseFiles.keys(), ...oursFiles.keys(), ...theirsFiles.keys()]);
    let hasConflicts = false;
    const mergedEntries = [];
    for (const filePath of allPaths) {
        const baseSha = baseFiles.get(filePath);
        const oursSha = oursFiles.get(filePath);
        const theirsSha = theirsFiles.get(filePath);
        if (oursSha === theirsSha) {
            // Same in both - no conflict
            if (oursSha) {
                addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
            }
            // If both deleted, don't add
            continue;
        }
        if (!theirsSha) {
            // Deleted in theirs
            if (oursSha === baseSha) {
                // Not modified in ours - accept deletion
                const fullPath = path.join(repoRoot, filePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                continue;
            }
            // Modified in ours, deleted in theirs - conflict
            // Keep ours for now
            if (oursSha) {
                addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
            }
            continue;
        }
        if (!oursSha) {
            // Deleted in ours
            if (theirsSha === baseSha) {
                // Not modified in theirs - keep deletion
                continue;
            }
            // Modified in theirs, deleted in ours - add theirs
            addMergedFile(repoRoot, mergedEntries, filePath, theirsSha);
            continue;
        }
        if (!baseSha) {
            // Added in both with different content - conflict
            const oursContent = getFileContent(repoRoot, oursSha);
            const theirsContent = getFileContent(repoRoot, theirsSha);
            if (oursContent === theirsContent) {
                addMergedFile(repoRoot, mergedEntries, filePath, oursSha);
            }
            else {
                // Conflict
                hasConflicts = true;
                writeConflictFile(repoRoot, filePath, null, oursContent, theirsContent, branchName);
                // Don't add to index - leave unmerged
            }
            continue;
        }
        // Both modified - need 3-way merge
        const baseContent = getFileContent(repoRoot, baseSha);
        const oursContent = getFileContent(repoRoot, oursSha);
        const theirsContent = getFileContent(repoRoot, theirsSha);
        const result = (0, merge_algo_1.merge3Way)(baseContent, oursContent, theirsContent);
        if (result.hasConflict) {
            hasConflicts = true;
            const fullPath = path.join(repoRoot, filePath);
            (0, utils_1.ensureDir)(path.dirname(fullPath));
            // Write conflict markers
            const conflictContent = result.content.replace(/incoming/g, branchName);
            fs.writeFileSync(fullPath, conflictContent);
            // Don't add to index - leave unmerged
        }
        else {
            // Write merged content
            const fullPath = path.join(repoRoot, filePath);
            (0, utils_1.ensureDir)(path.dirname(fullPath));
            fs.writeFileSync(fullPath, result.content);
            // Add to index
            const stat = fs.statSync(fullPath);
            const { createBlobContent, writeObject } = require('../objects');
            const blobContent = createBlobContent(Buffer.from(result.content));
            const blobSha = writeObject(repoRoot, blobContent);
            mergedEntries.push((0, index_file_1.createIndexEntryFromFile)(filePath, blobSha, 0o100644, stat));
        }
    }
    (0, index_file_1.writeIndex)(repoRoot, mergedEntries);
    if (hasConflicts) {
        // Save merge state
        saveMergeState(repoRoot, theirsSha, branchName);
        console.error('Automatic merge failed; fix conflicts and then commit the result.');
        return 1;
    }
    if (noCommit) {
        console.log('Automatic merge went well; stopped before committing as requested');
        return 0;
    }
    // Create merge commit
    return createMergeCommit(repoRoot, oursSha, theirsSha, branchName, mergedEntries);
}
function createMergeCommit(repoRoot, oursSha, theirsSha, branchName, entries) {
    // Create tree from merged entries
    const treeSha = createTreeFromEntries(repoRoot, entries);
    // Create commit
    const author = (0, utils_1.getAuthorInfo)();
    const committer = (0, utils_1.getCommitterInfo)();
    const commitInfo = {
        tree: treeSha,
        parents: [oursSha, theirsSha],
        author: author.name,
        authorEmail: author.email,
        authorTimestamp: author.timestamp,
        authorTz: author.tz,
        committer: committer.name,
        committerEmail: committer.email,
        committerTimestamp: committer.timestamp,
        committerTz: committer.tz,
        message: `Merge branch '${branchName}'`,
    };
    const commitContent = (0, objects_1.createCommitContent)(commitInfo);
    const commitSha = (0, objects_1.writeObject)(repoRoot, commitContent);
    // Update branch
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (currentBranch) {
        (0, refs_1.updateBranch)(repoRoot, currentBranch, commitSha);
    }
    else {
        (0, refs_1.writeHead)(repoRoot, commitSha);
    }
    // Clean up merge state
    cleanMergeState(repoRoot);
    console.log(`Merge made by the 'recursive' strategy.`);
    return 0;
}
function createTreeFromEntries(repoRoot, entries) {
    // Group entries by directory
    const trees = new Map();
    trees.set('', []);
    for (const entry of entries) {
        const parts = entry.name.split('/');
        const fileName = parts.pop();
        const dirPath = parts.join('/');
        // Ensure all parent directories exist
        let currentPath = '';
        for (const part of parts) {
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!trees.has(currentPath)) {
                trees.set(currentPath, []);
            }
        }
        if (!trees.has(dirPath)) {
            trees.set(dirPath, []);
        }
        let modeStr;
        if (entry.mode === 0o120000) {
            modeStr = '120000';
        }
        else if (entry.mode === 0o100755) {
            modeStr = '100755';
        }
        else {
            modeStr = '100644';
        }
        trees.get(dirPath).push({
            mode: modeStr,
            name: fileName,
            sha: entry.sha,
        });
    }
    // Build trees bottom-up
    const sortedDirs = [...trees.keys()].sort((a, b) => b.length - a.length);
    for (const dir of sortedDirs) {
        if (dir === '')
            continue;
        const treeEntries = trees.get(dir);
        const treeContent = (0, objects_1.createTreeContent)(treeEntries);
        const treeSha = (0, objects_1.writeObject)(repoRoot, treeContent);
        const parts = dir.split('/');
        const name = parts.pop();
        const parentDir = parts.join('/');
        trees.get(parentDir).push({
            mode: '40000',
            name,
            sha: treeSha,
        });
    }
    const rootEntries = trees.get('');
    const rootContent = (0, objects_1.createTreeContent)(rootEntries);
    return (0, objects_1.writeObject)(repoRoot, rootContent);
}
function getTreeFiles(repoRoot, commitSha) {
    const files = new Map();
    const { type, content } = (0, objects_1.readObject)(repoRoot, commitSha);
    if (type !== 'commit')
        return files;
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    collectTreeFiles(repoRoot, commitInfo.tree, '', files);
    return files;
}
function collectTreeFiles(repoRoot, treeSha, prefix, files) {
    const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            collectTreeFiles(repoRoot, entry.sha, fullName, files);
        }
        else {
            files.set(fullName, entry.sha);
        }
    }
}
function getFileContent(repoRoot, sha) {
    const { content } = (0, objects_1.readObject)(repoRoot, sha);
    return content.toString();
}
function addMergedFile(repoRoot, entries, filePath, sha) {
    const { content } = (0, objects_1.readObject)(repoRoot, sha);
    const fullPath = path.join(repoRoot, filePath);
    (0, utils_1.ensureDir)(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
    const stat = fs.statSync(fullPath);
    entries.push((0, index_file_1.createIndexEntryFromFile)(filePath, sha, 0o100644, stat));
}
function writeConflictFile(repoRoot, filePath, baseContent, oursContent, theirsContent, branchName) {
    const fullPath = path.join(repoRoot, filePath);
    (0, utils_1.ensureDir)(path.dirname(fullPath));
    const lines = [];
    lines.push('<<<<<<< HEAD');
    lines.push(oursContent);
    lines.push('=======');
    lines.push(theirsContent);
    lines.push(`>>>>>>> ${branchName}`);
    fs.writeFileSync(fullPath, lines.join('\n'));
}
function isAncestor(repoRoot, possibleAncestor, descendant) {
    const visited = new Set();
    const queue = [descendant];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === possibleAncestor) {
            return true;
        }
        if (visited.has(current)) {
            continue;
        }
        visited.add(current);
        const parents = getParents(repoRoot, current);
        queue.push(...parents);
    }
    return false;
}
function getParents(repoRoot, sha) {
    try {
        const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
        if (type !== 'commit')
            return [];
        const info = (0, objects_1.parseCommitContent)(content);
        return info.parents;
    }
    catch {
        return [];
    }
}
function updateWorkingTreeToCommit(repoRoot, sha) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const currentHead = (0, refs_1.getHeadCommit)(repoRoot);
    // Get current tree files
    const currentFiles = new Set();
    if (currentHead) {
        const { content } = (0, objects_1.readObject)(repoRoot, currentHead);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        collectTreeFilesSet(repoRoot, commitInfo.tree, '', currentFiles);
    }
    // Get target tree files
    const { content } = (0, objects_1.readObject)(repoRoot, sha);
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    const targetFiles = new Map();
    collectTreeFilesWithMode(repoRoot, commitInfo.tree, '', targetFiles);
    // Remove files not in target
    for (const file of currentFiles) {
        if (!targetFiles.has(file)) {
            const fullPath = path.join(repoRoot, file);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }
    }
    // Update/create files from target
    const newEntries = [];
    for (const [name, { sha: fileSha, mode }] of targetFiles) {
        const fullPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(fullPath));
        const { content } = (0, objects_1.readObject)(repoRoot, fileSha);
        fs.writeFileSync(fullPath, content);
        if (mode === '100755') {
            fs.chmodSync(fullPath, 0o755);
        }
        const stat = fs.statSync(fullPath);
        newEntries.push((0, index_file_1.createIndexEntryFromFile)(name, fileSha, parseInt(mode, 8), stat));
    }
    (0, index_file_1.writeIndex)(repoRoot, newEntries);
}
function collectTreeFilesSet(repoRoot, treeSha, prefix, files) {
    const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            collectTreeFilesSet(repoRoot, entry.sha, fullName, files);
        }
        else {
            files.add(fullName);
        }
    }
}
function collectTreeFilesWithMode(repoRoot, treeSha, prefix, files) {
    const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            collectTreeFilesWithMode(repoRoot, entry.sha, fullName, files);
        }
        else {
            files.set(fullName, { sha: entry.sha, mode: entry.mode });
        }
    }
}
function saveMergeState(repoRoot, theirsSha, branchName) {
    const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
    fs.writeFileSync(mergeHeadPath, theirsSha + '\n');
    const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');
    fs.writeFileSync(mergeMsgPath, `Merge branch '${branchName}'\n`);
}
function cleanMergeState(repoRoot) {
    const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
    const mergeMsgPath = path.join(repoRoot, '.minigit', 'MERGE_MSG');
    if (fs.existsSync(mergeHeadPath)) {
        fs.unlinkSync(mergeHeadPath);
    }
    if (fs.existsSync(mergeMsgPath)) {
        fs.unlinkSync(mergeMsgPath);
    }
}
function abortMerge(repoRoot) {
    const mergeHeadPath = path.join(repoRoot, '.minigit', 'MERGE_HEAD');
    if (!fs.existsSync(mergeHeadPath)) {
        console.error('fatal: There is no merge to abort');
        return 1;
    }
    // Reset to HEAD
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (headSha) {
        updateWorkingTreeToCommit(repoRoot, headSha);
    }
    // Clean merge state
    cleanMergeState(repoRoot);
    return 0;
}
