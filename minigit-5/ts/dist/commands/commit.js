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
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let message = null;
    let amend = false;
    let autoStage = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-m' && i + 1 < args.length) {
            message = args[i + 1];
            i++;
        }
        else if (arg === '--amend') {
            amend = true;
        }
        else if (arg === '-a') {
            autoStage = true;
        }
    }
    if (!message && !amend) {
        console.error('error: must provide commit message with -m');
        return 1;
    }
    // Auto-stage modified tracked files if -a flag
    if (autoStage) {
        const headSha = (0, refs_1.getHeadCommit)(repoRoot);
        if (headSha) {
            try {
                const treeSha = (0, objects_1.getTreeFromTreeIsh)(headSha, repoRoot);
                const trackedFiles = (0, objects_1.walkTree)(treeSha, '', repoRoot);
                const index = (0, index_file_1.readIndex)(repoRoot);
                for (const [filePath] of trackedFiles) {
                    const fullPath = path.join(repoRoot, filePath);
                    if (fs.existsSync(fullPath)) {
                        const stats = fs.lstatSync(fullPath);
                        if (!stats.isDirectory()) {
                            const content = stats.isSymbolicLink()
                                ? Buffer.from(fs.readlinkSync(fullPath))
                                : fs.readFileSync(fullPath);
                            const sha = (0, objects_1.createBlob)(content, true, repoRoot);
                            const mode = (0, utils_1.getFileMode)(fullPath);
                            const existingIdx = index.entries.findIndex(e => e.path === filePath);
                            const entry = {
                                ctimeSec: Math.floor(stats.ctimeMs / 1000),
                                ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
                                mtimeSec: Math.floor(stats.mtimeMs / 1000),
                                mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
                                dev: stats.dev,
                                ino: stats.ino,
                                mode,
                                uid: stats.uid,
                                gid: stats.gid,
                                size: stats.size,
                                sha,
                                flags: Math.min(filePath.length, 0xfff),
                                path: filePath,
                            };
                            if (existingIdx >= 0) {
                                index.entries[existingIdx] = entry;
                            }
                            else {
                                index.entries.push(entry);
                            }
                        }
                    }
                }
                (0, index_file_1.writeIndex)(index, repoRoot);
            }
            catch {
                // No HEAD commit yet
            }
        }
    }
    // Read current index
    const index = (0, index_file_1.readIndex)(repoRoot);
    if (index.entries.length === 0 && !amend) {
        console.error('nothing to commit');
        return 1;
    }
    // Get current HEAD
    const headSha = (0, refs_1.getHeadCommit)(repoRoot);
    // For amend, get the previous commit's message if no new message
    let parents = [];
    if (amend) {
        if (!headSha) {
            console.error('fatal: no commit to amend');
            return 1;
        }
        const { getCommit } = require('../objects');
        const prevCommit = getCommit(headSha, repoRoot);
        parents = prevCommit.parents;
        if (!message) {
            message = prevCommit.message;
        }
    }
    else {
        if (headSha) {
            parents = [headSha];
        }
    }
    // Check if there are any changes to commit
    if (headSha && !amend) {
        const headTreeSha = (0, objects_1.getTreeFromTreeIsh)(headSha, repoRoot);
        const headFiles = (0, objects_1.walkTree)(headTreeSha, '', repoRoot);
        // Compare with index
        let hasChanges = false;
        const indexFiles = new Map();
        for (const entry of index.entries) {
            indexFiles.set(entry.path, entry.sha);
        }
        // Check for differences
        if (indexFiles.size !== headFiles.size) {
            hasChanges = true;
        }
        else {
            for (const [filePath, sha] of indexFiles) {
                const headEntry = headFiles.get(filePath);
                if (!headEntry || headEntry.sha !== sha) {
                    hasChanges = true;
                    break;
                }
            }
        }
        if (!hasChanges) {
            console.error('nothing to commit, working tree clean');
            return 1;
        }
    }
    // Build tree from index
    const treeSha = (0, index_file_1.buildTreeFromIndex)(repoRoot);
    // Get author and committer info
    const authorInfo = (0, utils_1.getAuthorInfo)();
    const committerInfo = (0, utils_1.getCommitterInfo)();
    const author = (0, utils_1.formatAuthorDate)(authorInfo.name, authorInfo.email, authorInfo.date, authorInfo.tz);
    const committer = (0, utils_1.formatAuthorDate)(committerInfo.name, committerInfo.email, committerInfo.date, committerInfo.tz);
    // Create commit
    const commitSha = (0, objects_1.createCommit)(treeSha, parents, author, committer, message, repoRoot);
    // Update HEAD/branch
    const branch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (branch) {
        (0, refs_1.updateRef)(`refs/heads/${branch}`, commitSha, repoRoot);
    }
    else {
        // Detached HEAD
        (0, refs_1.setHead)(commitSha, repoRoot);
    }
    // Output result
    const shortSha = commitSha.slice(0, 7);
    const isRoot = parents.length === 0;
    const branchInfo = branch ? ` (${branch})` : '';
    console.log(`[${branch || 'detached HEAD'} ${isRoot ? '(root-commit) ' : ''}${shortSha}] ${message.split('\n')[0]}`);
    return 0;
}
