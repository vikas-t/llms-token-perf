"use strict";
// checkout command - Switch branches or restore files
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
exports.checkout = checkout;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
const objects_1 = require("../objects");
const refs_1 = require("../refs");
function checkout(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let createBranch = false;
    const positional = [];
    let inPathSpec = false;
    const pathSpecs = [];
    for (const arg of args) {
        if (arg === '-b') {
            createBranch = true;
        }
        else if (arg === '--') {
            inPathSpec = true;
        }
        else if (inPathSpec) {
            pathSpecs.push(arg);
        }
        else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }
    // checkout -- <paths> : restore files from index
    if (pathSpecs.length > 0) {
        const commit = positional.length > 0 ? positional[0] : null;
        return restoreFiles(repoRoot, commit, pathSpecs);
    }
    // checkout -b <branch> [start-point]
    if (createBranch) {
        if (positional.length === 0) {
            console.error('fatal: branch name required');
            return 1;
        }
        const branchName = positional[0];
        const startPoint = positional[1];
        return createAndCheckoutBranch(repoRoot, branchName, startPoint);
    }
    // checkout <branch|commit>
    if (positional.length === 0) {
        console.error('fatal: checkout requires a branch name or commit');
        return 1;
    }
    const target = positional[0];
    // Check if it's a branch
    if ((0, refs_1.branchExists)(repoRoot, target)) {
        return checkoutBranch(repoRoot, target);
    }
    // Try to resolve as commit
    const sha = (0, refs_1.resolveRevision)(repoRoot, target);
    if (sha) {
        return checkoutDetached(repoRoot, sha);
    }
    console.error(`error: pathspec '${target}' did not match any file(s) known to git`);
    return 1;
}
function checkoutBranch(repoRoot, branchName) {
    const sha = (0, refs_1.resolveRef)(repoRoot, branchName);
    if (!sha) {
        console.error(`error: branch '${branchName}' not found`);
        return 1;
    }
    // Check for uncommitted changes that would be overwritten
    if (!canSafelyCheckout(repoRoot, sha)) {
        console.error('error: Your local changes to the following files would be overwritten by checkout');
        console.error('Please commit your changes or stash them before you switch branches.');
        return 1;
    }
    // Update working tree and index
    updateWorkingTree(repoRoot, sha);
    // Update HEAD
    (0, refs_1.writeSymbolicRef)(repoRoot, 'HEAD', `refs/heads/${branchName}`);
    console.log(`Switched to branch '${branchName}'`);
    return 0;
}
function checkoutDetached(repoRoot, sha) {
    // Check for uncommitted changes that would be overwritten
    if (!canSafelyCheckout(repoRoot, sha)) {
        console.error('error: Your local changes to the following files would be overwritten by checkout');
        console.error('Please commit your changes or stash them before you switch branches.');
        return 1;
    }
    // Update working tree and index
    updateWorkingTree(repoRoot, sha);
    // Update HEAD to detached state
    (0, refs_1.writeHead)(repoRoot, sha);
    console.log(`HEAD is now at ${sha.slice(0, 7)}`);
    return 0;
}
function createAndCheckoutBranch(repoRoot, branchName, startPoint) {
    // Check if branch already exists
    if ((0, refs_1.branchExists)(repoRoot, branchName)) {
        console.error(`fatal: branch '${branchName}' already exists`);
        return 1;
    }
    // Resolve start point
    let sha;
    if (startPoint) {
        sha = (0, refs_1.resolveRevision)(repoRoot, startPoint);
        if (!sha) {
            console.error(`fatal: not a valid object name: '${startPoint}'`);
            return 1;
        }
    }
    else {
        sha = (0, refs_1.getHeadCommit)(repoRoot);
        if (!sha) {
            console.error('fatal: not a valid object name: HEAD');
            return 1;
        }
    }
    // Check for uncommitted changes that would be overwritten
    if (!canSafelyCheckout(repoRoot, sha)) {
        console.error('error: Your local changes to the following files would be overwritten by checkout');
        return 1;
    }
    // Create branch
    (0, refs_1.updateBranch)(repoRoot, branchName, sha);
    // Update working tree if start point is different from current
    const currentSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (currentSha !== sha) {
        updateWorkingTree(repoRoot, sha);
    }
    // Update HEAD
    (0, refs_1.writeSymbolicRef)(repoRoot, 'HEAD', `refs/heads/${branchName}`);
    console.log(`Switched to a new branch '${branchName}'`);
    return 0;
}
function restoreFiles(repoRoot, commit, paths) {
    let entries = (0, index_file_1.readIndex)(repoRoot);
    for (const pathSpec of paths) {
        const relativePath = (0, utils_1.normalizePathSeparator)(pathSpec);
        if (commit) {
            // Restore from commit
            const sha = (0, refs_1.resolveRevision)(repoRoot, commit);
            if (!sha) {
                console.error(`error: pathspec '${commit}' did not match any known ref`);
                return 1;
            }
            const { content } = (0, objects_1.readObject)(repoRoot, sha);
            const commitInfo = (0, objects_1.parseCommitContent)(content);
            const fileContent = getFileFromTree(repoRoot, commitInfo.tree, relativePath);
            if (fileContent === null) {
                console.error(`error: pathspec '${pathSpec}' did not match any file(s) known to git`);
                return 1;
            }
            // Write to working tree
            const fullPath = path.join(repoRoot, relativePath);
            (0, utils_1.ensureDir)(path.dirname(fullPath));
            fs.writeFileSync(fullPath, fileContent);
        }
        else {
            // Restore from index
            const entry = entries.find((e) => e.name === relativePath);
            if (!entry) {
                console.error(`error: pathspec '${pathSpec}' did not match any file(s) known to git`);
                return 1;
            }
            const { content } = (0, objects_1.readObject)(repoRoot, entry.sha);
            const fullPath = path.join(repoRoot, relativePath);
            (0, utils_1.ensureDir)(path.dirname(fullPath));
            fs.writeFileSync(fullPath, content);
        }
    }
    return 0;
}
function canSafelyCheckout(repoRoot, targetSha) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const currentHead = (0, refs_1.getHeadCommit)(repoRoot);
    // Get target tree files
    const targetFiles = new Map();
    const { content } = (0, objects_1.readObject)(repoRoot, targetSha);
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    collectTreeFiles(repoRoot, commitInfo.tree, '', targetFiles);
    // Get current tree files
    const currentFiles = new Map();
    if (currentHead) {
        const { content: currentContent } = (0, objects_1.readObject)(repoRoot, currentHead);
        const currentCommitInfo = (0, objects_1.parseCommitContent)(currentContent);
        collectTreeFiles(repoRoot, currentCommitInfo.tree, '', currentFiles);
    }
    // Check for uncommitted changes that would be overwritten
    for (const entry of entries) {
        const fullPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(fullPath)) {
            // File is deleted in working tree
            continue;
        }
        const targetSha = targetFiles.get(entry.name);
        const currentSha = currentFiles.get(entry.name);
        // If target differs from current and working tree differs from index
        if (targetSha !== currentSha) {
            // Check if working tree matches index
            const stat = fs.lstatSync(fullPath);
            let content;
            if (stat.isSymbolicLink()) {
                content = Buffer.from(fs.readlinkSync(fullPath));
            }
            else {
                content = fs.readFileSync(fullPath);
            }
            const blobContent = (0, objects_1.createBlobContent)(content);
            const workingSha = (0, objects_1.hashObject)(blobContent);
            if (workingSha !== entry.sha) {
                // Working tree has changes that would be lost
                return false;
            }
        }
    }
    return true;
}
function updateWorkingTree(repoRoot, sha) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    // Get current tree files
    const currentHead = (0, refs_1.getHeadCommit)(repoRoot);
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
    // Remove files that are in current but not in target
    for (const file of currentFiles) {
        if (!targetFiles.has(file)) {
            const fullPath = path.join(repoRoot, file);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                // Remove empty parent directories
                removeEmptyDirs(repoRoot, path.dirname(fullPath));
            }
        }
    }
    // Update/create files from target
    const newEntries = [];
    for (const [name, { sha: fileSha, mode }] of targetFiles) {
        const fullPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(fullPath));
        const { content } = (0, objects_1.readObject)(repoRoot, fileSha);
        if (mode === '120000') {
            // Symlink
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
            fs.symlinkSync(content.toString(), fullPath);
        }
        else {
            fs.writeFileSync(fullPath, content);
            if (mode === '100755') {
                fs.chmodSync(fullPath, 0o755);
            }
        }
        // Create index entry
        const stat = fs.lstatSync(fullPath);
        newEntries.push({
            ctimeSec: Math.floor(stat.ctimeMs / 1000),
            ctimeNsec: Math.floor((stat.ctimeMs % 1000) * 1000000),
            mtimeSec: Math.floor(stat.mtimeMs / 1000),
            mtimeNsec: Math.floor((stat.mtimeMs % 1000) * 1000000),
            dev: stat.dev,
            ino: stat.ino,
            mode: parseInt(mode, 8),
            uid: stat.uid,
            gid: stat.gid,
            size: stat.size,
            sha: fileSha,
            flags: 0,
            name,
        });
    }
    (0, index_file_1.writeIndex)(repoRoot, newEntries);
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
function getFileFromTree(repoRoot, treeSha, filePath) {
    const parts = filePath.split('/').filter((p) => p);
    let currentSha = treeSha;
    for (let i = 0; i < parts.length; i++) {
        const { content } = (0, objects_1.readObject)(repoRoot, currentSha);
        const entries = (0, objects_1.parseTreeContent)(content);
        const entry = entries.find((e) => e.name === parts[i]);
        if (!entry) {
            return null;
        }
        currentSha = entry.sha;
    }
    const { type, content } = (0, objects_1.readObject)(repoRoot, currentSha);
    if (type !== 'blob') {
        return null;
    }
    return content;
}
function removeEmptyDirs(repoRoot, dirPath) {
    while (dirPath !== repoRoot && dirPath.startsWith(repoRoot)) {
        try {
            const entries = fs.readdirSync(dirPath);
            if (entries.length === 0) {
                fs.rmdirSync(dirPath);
                dirPath = path.dirname(dirPath);
            }
            else {
                break;
            }
        }
        catch {
            break;
        }
    }
}
