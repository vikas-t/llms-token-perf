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
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function checkout(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let createBranchFlag = false;
    let force = false;
    const positionalArgs = [];
    let pathMode = false;
    const paths = [];
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-b') {
            createBranchFlag = true;
        }
        else if (arg === '-f' || arg === '--force') {
            force = true;
        }
        else if (arg === '--') {
            pathMode = true;
        }
        else if (pathMode) {
            paths.push(arg);
        }
        else if (!arg.startsWith('-')) {
            positionalArgs.push(arg);
        }
    }
    // Determine mode
    if (paths.length > 0 || pathMode) {
        // checkout [<commit>] -- <paths>
        const commitRef = positionalArgs.length > 0 ? positionalArgs[0] : null;
        checkoutPaths(commitRef, paths, repoRoot);
    }
    else if (createBranchFlag) {
        // checkout -b <new-branch> [<start-point>]
        if (positionalArgs.length === 0) {
            console.error('fatal: branch name required');
            process.exit(1);
        }
        const branchName = positionalArgs[0];
        const startPoint = positionalArgs.length > 1 ? positionalArgs[1] : null;
        createAndCheckoutBranch(branchName, startPoint, repoRoot);
    }
    else if (positionalArgs.length > 0) {
        const target = positionalArgs[0];
        // Check if it's a branch
        if ((0, refs_1.branchExists)(target, repoRoot)) {
            checkoutBranch(target, force, repoRoot);
        }
        else {
            // Try as a commit SHA
            const sha = (0, refs_1.resolveRef)(target, repoRoot);
            if (sha) {
                checkoutDetached(sha, force, repoRoot);
            }
            else {
                // Try as a file path
                const absPath = path.resolve(process.cwd(), target);
                const relPath = path.relative(repoRoot, absPath);
                if (fs.existsSync(absPath) || (0, index_file_1.readIndex)(repoRoot).some(e => e.name === (0, utils_1.normalizePath)(relPath))) {
                    checkoutPaths(null, [target], repoRoot);
                }
                else {
                    console.error(`error: pathspec '${target}' did not match any file(s) known to git`);
                    process.exit(1);
                }
            }
        }
    }
    else {
        console.error('fatal: you must specify a branch or a path');
        process.exit(1);
    }
}
function checkoutBranch(branchName, force, repoRoot) {
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (currentBranch === branchName) {
        console.log(`Already on '${branchName}'`);
        return;
    }
    const targetSha = (0, refs_1.resolveRef)(branchName, repoRoot);
    if (!targetSha) {
        console.error(`error: branch '${branchName}' not found`);
        process.exit(1);
    }
    // Check for uncommitted changes that would be overwritten
    if (!force) {
        const conflicts = checkForConflicts(targetSha, repoRoot);
        if (conflicts.length > 0) {
            console.error('error: Your local changes to the following files would be overwritten by checkout:');
            for (const file of conflicts) {
                console.error(`\t${file}`);
            }
            console.error('Please commit your changes or stash them before you switch branches.');
            process.exit(1);
        }
    }
    // Update working tree
    updateWorkingTree(targetSha, repoRoot);
    // Update HEAD
    (0, refs_1.setSymbolicRef)('HEAD', `refs/heads/${branchName}`, repoRoot);
    console.log(`Switched to branch '${branchName}'`);
}
function checkoutDetached(sha, force, repoRoot) {
    // Check for uncommitted changes
    if (!force) {
        const conflicts = checkForConflicts(sha, repoRoot);
        if (conflicts.length > 0) {
            console.error('error: Your local changes to the following files would be overwritten by checkout:');
            for (const file of conflicts) {
                console.error(`\t${file}`);
            }
            process.exit(1);
        }
    }
    // Update working tree
    updateWorkingTree(sha, repoRoot);
    // Update HEAD to detached state
    (0, refs_1.setHead)(sha, repoRoot);
    console.log(`Note: switching to '${sha.slice(0, 7)}'.`);
    console.log('');
    console.log('You are in \'detached HEAD\' state.');
}
function createAndCheckoutBranch(branchName, startPoint, repoRoot) {
    if ((0, refs_1.branchExists)(branchName, repoRoot)) {
        console.error(`fatal: a branch named '${branchName}' already exists`);
        process.exit(1);
    }
    let sha;
    if (startPoint) {
        sha = (0, refs_1.resolveRef)(startPoint, repoRoot);
        if (!sha) {
            console.error(`fatal: not a valid object name: '${startPoint}'`);
            process.exit(1);
        }
    }
    else {
        sha = (0, refs_1.getHeadCommit)(repoRoot);
        if (!sha) {
            console.error('fatal: not a valid object name: HEAD');
            process.exit(1);
        }
    }
    // If starting from a different commit, update working tree first
    const currentSha = (0, refs_1.getHeadCommit)(repoRoot);
    if (currentSha !== sha) {
        updateWorkingTree(sha, repoRoot);
    }
    // Create branch
    (0, refs_1.createBranch)(branchName, sha, repoRoot);
    // Update HEAD
    (0, refs_1.setSymbolicRef)('HEAD', `refs/heads/${branchName}`, repoRoot);
    console.log(`Switched to a new branch '${branchName}'`);
}
function checkoutPaths(commitRef, paths, repoRoot) {
    let sourceFiles;
    if (commitRef) {
        const sha = (0, refs_1.resolveRef)(commitRef, repoRoot);
        if (!sha) {
            console.error(`error: pathspec '${commitRef}' did not match any file(s) known to git`);
            process.exit(1);
        }
        const obj = (0, objects_1.readObject)(sha, repoRoot);
        if (obj.type !== 'commit') {
            console.error(`error: '${commitRef}' is not a commit`);
            process.exit(1);
        }
        const commit = (0, objects_1.parseCommit)(obj.content);
        sourceFiles = new Map();
        collectTreeFilesWithMode(commit.tree, '', repoRoot, sourceFiles);
    }
    else {
        // Restore from index
        const entries = (0, index_file_1.readIndex)(repoRoot);
        sourceFiles = new Map(entries.map(e => [e.name, { sha: e.sha, mode: e.mode }]));
    }
    for (const pathspec of paths) {
        const relPath = (0, utils_1.normalizePath)(path.relative(repoRoot, path.resolve(process.cwd(), pathspec)));
        const entry = sourceFiles.get(relPath);
        if (entry) {
            // Restore single file
            restoreFile(relPath, entry.sha, entry.mode, repoRoot);
        }
        else {
            // Check if it's a directory prefix
            let found = false;
            for (const [name, e] of sourceFiles) {
                if (name.startsWith(relPath + '/') || name === relPath) {
                    restoreFile(name, e.sha, e.mode, repoRoot);
                    found = true;
                }
            }
            if (!found) {
                console.error(`error: pathspec '${pathspec}' did not match any file(s) known to git`);
                process.exit(1);
            }
        }
    }
}
function restoreFile(relPath, sha, mode, repoRoot) {
    const absPath = path.join(repoRoot, relPath);
    (0, utils_1.ensureDir)(path.dirname(absPath));
    const obj = (0, objects_1.readObject)(sha, repoRoot);
    fs.writeFileSync(absPath, obj.content);
    // Set file mode
    if (mode === 0o100755) {
        fs.chmodSync(absPath, 0o755);
    }
}
function updateWorkingTree(targetSha, repoRoot) {
    const currentSha = (0, refs_1.getHeadCommit)(repoRoot);
    // Get current and target tree files
    const currentFiles = new Map();
    const targetFiles = new Map();
    if (currentSha) {
        const currentCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(currentSha, repoRoot).content);
        collectTreeFilesWithMode(currentCommit.tree, '', repoRoot, currentFiles);
    }
    const targetCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(targetSha, repoRoot).content);
    collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);
    // Remove files not in target
    for (const [name] of currentFiles) {
        if (!targetFiles.has(name)) {
            const absPath = path.join(repoRoot, name);
            if (fs.existsSync(absPath)) {
                fs.unlinkSync(absPath);
                // Try to remove empty parent directories
                removeEmptyDirs(path.dirname(absPath), repoRoot);
            }
        }
    }
    // Add/update files in target
    for (const [name, entry] of targetFiles) {
        const absPath = path.join(repoRoot, name);
        (0, utils_1.ensureDir)(path.dirname(absPath));
        const obj = (0, objects_1.readObject)(entry.sha, repoRoot);
        fs.writeFileSync(absPath, obj.content);
        if (entry.mode === 0o100755) {
            fs.chmodSync(absPath, 0o755);
        }
    }
    // Update index to match target
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
}
function checkForConflicts(targetSha, repoRoot) {
    const indexEntries = (0, index_file_1.readIndex)(repoRoot);
    const conflicts = [];
    const targetCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(targetSha, repoRoot).content);
    const targetFiles = new Map();
    collectTreeFilesWithMode(targetCommit.tree, '', repoRoot, targetFiles);
    for (const entry of indexEntries) {
        const absPath = path.join(repoRoot, entry.name);
        const targetEntry = targetFiles.get(entry.name);
        if (!fs.existsSync(absPath))
            continue;
        // Check if working tree differs from index
        const stats = fs.statSync(absPath);
        if (stats.isFile()) {
            const content = fs.readFileSync(absPath);
            const { sha1 } = require('../utils');
            const header = `blob ${content.length}\0`;
            const fullContent = Buffer.concat([Buffer.from(header), content]);
            const workSha = sha1(fullContent);
            if (workSha !== entry.sha) {
                // Working tree modified
                if (targetEntry && targetEntry.sha !== entry.sha) {
                    // Target also differs - conflict
                    conflicts.push(entry.name);
                }
            }
        }
    }
    return conflicts;
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
function removeEmptyDirs(dir, repoRoot) {
    while (dir !== repoRoot && dir.startsWith(repoRoot)) {
        try {
            const entries = fs.readdirSync(dir);
            if (entries.length === 0) {
                fs.rmdirSync(dir);
                dir = path.dirname(dir);
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
