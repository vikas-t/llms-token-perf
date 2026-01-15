"use strict";
// branch command - List, create, or delete branches
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
exports.branch = branch;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function branch(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let deleteFlag = false;
    let forceDelete = false;
    let rename = false;
    let verbose = false;
    const positional = [];
    for (const arg of args) {
        if (arg === '-d') {
            deleteFlag = true;
        }
        else if (arg === '-D') {
            forceDelete = true;
            deleteFlag = true;
        }
        else if (arg === '-m') {
            rename = true;
        }
        else if (arg === '-v' || arg === '--verbose') {
            verbose = true;
        }
        else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }
    if (deleteFlag) {
        // Delete branch
        if (positional.length === 0) {
            console.error('fatal: branch name required');
            return 1;
        }
        const branchName = positional[0];
        return deleteBranchCmd(repoRoot, branchName, forceDelete);
    }
    if (rename) {
        // Rename branch
        if (positional.length < 2) {
            console.error('fatal: need old and new branch names');
            return 1;
        }
        const oldName = positional[0];
        const newName = positional[1];
        return renameBranch(repoRoot, oldName, newName);
    }
    if (positional.length === 0) {
        // List branches
        return listBranches(repoRoot, verbose);
    }
    // Create branch
    const branchName = positional[0];
    const startPoint = positional[1];
    return createBranch(repoRoot, branchName, startPoint);
}
function listBranches(repoRoot, verbose) {
    const branches = (0, refs_1.getBranches)(repoRoot);
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    for (const branch of branches) {
        const isCurrent = branch === currentBranch;
        const prefix = isCurrent ? '* ' : '  ';
        if (verbose) {
            const sha = (0, refs_1.resolveRef)(repoRoot, branch);
            if (sha) {
                let message = '';
                try {
                    const { content } = (0, objects_1.readObject)(repoRoot, sha);
                    const info = (0, objects_1.parseCommitContent)(content);
                    message = info.message.split('\n')[0];
                }
                catch {
                    // Ignore
                }
                console.log(`${prefix}${branch} ${(0, utils_1.shortSha)(sha)} ${message}`);
            }
            else {
                console.log(`${prefix}${branch}`);
            }
        }
        else {
            console.log(`${prefix}${branch}`);
        }
    }
    return 0;
}
function createBranch(repoRoot, branchName, startPoint) {
    // Validate branch name
    if (!(0, utils_1.isValidBranchName)(branchName)) {
        console.error(`fatal: '${branchName}' is not a valid branch name`);
        return 1;
    }
    // Check if already exists
    if ((0, refs_1.branchExists)(repoRoot, branchName)) {
        console.error(`fatal: branch '${branchName}' already exists`);
        return 1;
    }
    // Get starting commit
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
    (0, refs_1.updateBranch)(repoRoot, branchName, sha);
    return 0;
}
function deleteBranchCmd(repoRoot, branchName, force) {
    // Check if branch exists
    if (!(0, refs_1.branchExists)(repoRoot, branchName)) {
        console.error(`error: branch '${branchName}' not found`);
        return 1;
    }
    // Check if trying to delete current branch
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (branchName === currentBranch) {
        console.error(`error: Cannot delete branch '${branchName}' checked out`);
        return 1;
    }
    // If not force, check if branch is merged
    if (!force) {
        const branchSha = (0, refs_1.resolveRef)(repoRoot, branchName);
        const headSha = (0, refs_1.getHeadCommit)(repoRoot);
        if (branchSha && headSha && !isAncestor(repoRoot, branchSha, headSha)) {
            console.error(`error: branch '${branchName}' is not fully merged`);
            console.error(`If you are sure you want to delete it, run 'minigit branch -D ${branchName}'`);
            return 1;
        }
    }
    (0, refs_1.deleteBranch)(repoRoot, branchName);
    console.log(`Deleted branch ${branchName}`);
    return 0;
}
function renameBranch(repoRoot, oldName, newName) {
    // Validate new name
    if (!(0, utils_1.isValidBranchName)(newName)) {
        console.error(`fatal: '${newName}' is not a valid branch name`);
        return 1;
    }
    // Check if old branch exists
    if (!(0, refs_1.branchExists)(repoRoot, oldName)) {
        console.error(`error: branch '${oldName}' not found`);
        return 1;
    }
    // Check if new name already exists
    if ((0, refs_1.branchExists)(repoRoot, newName)) {
        console.error(`fatal: branch '${newName}' already exists`);
        return 1;
    }
    // Get the SHA of the old branch
    const sha = (0, refs_1.resolveRef)(repoRoot, oldName);
    if (!sha) {
        console.error(`error: branch '${oldName}' not found`);
        return 1;
    }
    // Create new branch
    (0, refs_1.updateBranch)(repoRoot, newName, sha);
    // Delete old branch
    (0, refs_1.deleteBranch)(repoRoot, oldName);
    // Update HEAD if it was pointing to old branch
    const currentBranch = (0, refs_1.getCurrentBranch)(repoRoot);
    if (currentBranch === oldName) {
        const headPath = path.join(repoRoot, '.minigit', 'HEAD');
        fs.writeFileSync(headPath, `ref: refs/heads/${newName}\n`);
    }
    return 0;
}
function isAncestor(repoRoot, commit, descendant) {
    // BFS to check if commit is an ancestor of descendant
    const visited = new Set();
    const queue = [descendant];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === commit) {
            return true;
        }
        if (visited.has(current)) {
            continue;
        }
        visited.add(current);
        if (!(0, objects_1.objectExists)(repoRoot, current)) {
            continue;
        }
        try {
            const { type, content } = (0, objects_1.readObject)(repoRoot, current);
            if (type !== 'commit')
                continue;
            const info = (0, objects_1.parseCommitContent)(content);
            queue.push(...info.parents);
        }
        catch {
            // Ignore errors
        }
    }
    return false;
}
