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
const index_file_1 = require("../index-file");
const objects_1 = require("../objects");
const refs_1 = require("../refs");
function commit(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let message = null;
    let amend = false;
    let autoStage = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-m' && i + 1 < args.length) {
            message = args[++i];
        }
        else if (args[i] === '--amend') {
            amend = true;
        }
        else if (args[i] === '-a') {
            autoStage = true;
        }
    }
    if (!message && !amend) {
        console.error('fatal: must provide commit message with -m');
        return 1;
    }
    let entries = (0, index_file_1.readIndex)(repoRoot);
    // Auto-stage modified tracked files if -a flag
    if (autoStage) {
        entries = autoStageTrackedFiles(repoRoot, entries);
        (0, index_file_1.writeIndex)(repoRoot, entries);
    }
    const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
    // For amend, get message from previous commit if not provided
    if (amend && !message && headCommit) {
        const { content } = (0, objects_1.readObject)(repoRoot, headCommit);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        message = commitInfo.message;
    }
    if (!message) {
        console.error('fatal: must provide commit message with -m');
        return 1;
    }
    // Check if there are changes to commit
    if (entries.length === 0 && !amend) {
        console.error('fatal: nothing to commit');
        return 1;
    }
    // For non-amend, compare with head commit tree
    if (!amend && headCommit) {
        const { content } = (0, objects_1.readObject)(repoRoot, headCommit);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        const headTreeSha = commitInfo.tree;
        const newTreeSha = createTreeFromIndex(repoRoot, entries);
        if (newTreeSha === headTreeSha) {
            console.error('nothing to commit, working tree clean');
            return 1;
        }
    }
    // Create tree from index
    const treeSha = createTreeFromIndex(repoRoot, entries);
    // Build commit info
    const author = (0, utils_1.getAuthorInfo)();
    const committer = (0, utils_1.getCommitterInfo)();
    let parents = [];
    if (amend && headCommit) {
        // For amend, use the parent(s) of the amended commit
        const { content } = (0, objects_1.readObject)(repoRoot, headCommit);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        parents = commitInfo.parents;
    }
    else if (headCommit) {
        parents = [headCommit];
    }
    const commitInfo = {
        tree: treeSha,
        parents,
        author: author.name,
        authorEmail: author.email,
        authorTimestamp: author.timestamp,
        authorTz: author.tz,
        committer: committer.name,
        committerEmail: committer.email,
        committerTimestamp: committer.timestamp,
        committerTz: committer.tz,
        message,
    };
    const commitContent = (0, objects_1.createCommitContent)(commitInfo);
    const commitSha = (0, objects_1.writeObject)(repoRoot, commitContent);
    // Update branch reference
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (currentBranch) {
        (0, refs_1.updateBranch)(repoRoot, currentBranch, commitSha);
    }
    else {
        // Detached HEAD
        (0, refs_1.writeHead)(repoRoot, commitSha);
    }
    const branchInfo = currentBranch ? ` (${currentBranch})` : ' (HEAD detached)';
    console.log(`[${currentBranch || 'HEAD'}${parents.length === 0 ? ' (root-commit)' : ''} ${(0, utils_1.shortSha)(commitSha)}] ${message.split('\n')[0]}`);
    return 0;
}
function createTreeFromIndex(repoRoot, entries) {
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
        // Add entry to its directory
        if (!trees.has(dirPath)) {
            trees.set(dirPath, []);
        }
        // Determine mode string
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
        // Add this tree to parent
        const parts = dir.split('/');
        const name = parts.pop();
        const parentDir = parts.join('/');
        trees.get(parentDir).push({
            mode: '40000',
            name,
            sha: treeSha,
        });
    }
    // Create root tree
    const rootEntries = trees.get('');
    const rootContent = (0, objects_1.createTreeContent)(rootEntries);
    return (0, objects_1.writeObject)(repoRoot, rootContent);
}
function autoStageTrackedFiles(repoRoot, entries) {
    const newEntries = [];
    for (const entry of entries) {
        const fullPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(fullPath)) {
            // File deleted - skip it (mark as deleted)
            continue;
        }
        const stat = fs.lstatSync(fullPath);
        const sha = (0, objects_1.createBlobFromFile)(repoRoot, fullPath);
        const mode = stat.isSymbolicLink() ? 0o120000 : (0, utils_1.getFileModeFromStat)(stat);
        const newEntry = (0, index_file_1.createIndexEntryFromFile)(entry.name, sha, mode, stat);
        newEntries.push(newEntry);
    }
    return newEntries;
}
