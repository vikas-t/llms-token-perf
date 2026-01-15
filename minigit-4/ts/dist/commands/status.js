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
        console.error('fatal: not a minigit repository');
        return 1;
    }
    const shortFormat = args.includes('--short') || args.includes('--porcelain');
    const result = computeStatus(repoRoot);
    if (shortFormat) {
        printShortStatus(result);
    }
    else {
        printLongStatus(repoRoot, result);
    }
    return 0;
}
function computeStatus(repoRoot) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
    // Get head tree files
    const headFiles = new Map();
    if (headCommit) {
        const { content } = (0, objects_1.readObject)(repoRoot, headCommit);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        collectTreeFiles(repoRoot, commitInfo.tree, '', headFiles);
    }
    // Build index map
    const indexFiles = new Map();
    for (const entry of entries) {
        indexFiles.set(entry.name, entry);
    }
    // Compare index to HEAD (staged changes)
    const staged = [];
    // Files in index but not in HEAD (new)
    for (const [name, entry] of indexFiles) {
        const headEntry = headFiles.get(name);
        if (!headEntry) {
            staged.push({ path: name, status: 'new' });
        }
        else if (headEntry.sha !== entry.sha) {
            staged.push({ path: name, status: 'modified' });
        }
    }
    // Files in HEAD but not in index (deleted)
    for (const [name] of headFiles) {
        if (!indexFiles.has(name)) {
            staged.push({ path: name, status: 'deleted' });
        }
    }
    // Compare working tree to index (unstaged changes)
    const unstaged = [];
    const untracked = [];
    // Collect all working tree files
    const workingFiles = new Set();
    collectWorkingTreeFiles(repoRoot, repoRoot, workingFiles);
    // Check index files against working tree
    for (const [name, entry] of indexFiles) {
        const fullPath = path.join(repoRoot, name);
        if (!fs.existsSync(fullPath)) {
            unstaged.push({ path: name, status: 'deleted' });
        }
        else {
            const stat = fs.lstatSync(fullPath);
            let content;
            if (stat.isSymbolicLink()) {
                const target = fs.readlinkSync(fullPath);
                content = Buffer.from(target);
            }
            else {
                content = fs.readFileSync(fullPath);
            }
            const blobContent = (0, objects_1.createBlobContent)(content);
            const sha = (0, objects_1.hashObject)(blobContent);
            if (sha !== entry.sha) {
                unstaged.push({ path: name, status: 'modified' });
            }
        }
        workingFiles.delete(name);
    }
    // Remaining files are untracked
    for (const name of workingFiles) {
        untracked.push(name);
    }
    // Sort all arrays
    staged.sort((a, b) => a.path.localeCompare(b.path));
    unstaged.sort((a, b) => a.path.localeCompare(b.path));
    untracked.sort();
    return { staged, unstaged, untracked };
}
function collectTreeFiles(repoRoot, treeSha, prefix, files) {
    const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            // Directory - recurse
            collectTreeFiles(repoRoot, entry.sha, fullName, files);
        }
        else {
            files.set(fullName, { sha: entry.sha, mode: parseInt(entry.mode, 8) });
        }
    }
}
function collectWorkingTreeFiles(repoRoot, dirPath, files) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.minigit')
            continue;
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = (0, utils_1.normalizePathSeparator)(path.relative(repoRoot, fullPath));
        if (entry.isDirectory()) {
            collectWorkingTreeFiles(repoRoot, fullPath, files);
        }
        else {
            files.add(relativePath);
        }
    }
}
function printShortStatus(result) {
    // Staged changes
    for (const change of result.staged) {
        const code = change.status === 'new' ? 'A' : change.status === 'modified' ? 'M' : 'D';
        console.log(`${code}  ${change.path}`);
    }
    // Unstaged changes
    for (const change of result.unstaged) {
        const code = change.status === 'modified' ? 'M' : 'D';
        console.log(` ${code} ${change.path}`);
    }
    // Untracked files
    for (const file of result.untracked) {
        console.log(`?? ${file}`);
    }
}
function printLongStatus(repoRoot, result) {
    const branch = (0, refs_1.getCurrentBranch)(repoRoot);
    console.log(`On branch ${branch || 'HEAD detached'}`);
    const hasStaged = result.staged.length > 0;
    const hasUnstaged = result.unstaged.length > 0;
    const hasUntracked = result.untracked.length > 0;
    if (hasStaged) {
        console.log('');
        console.log('Changes to be committed:');
        console.log('  (use "minigit restore --staged <file>..." to unstage)');
        console.log('');
        for (const change of result.staged) {
            const statusText = change.status === 'new' ? 'new file:   ' : change.status === 'modified' ? 'modified:   ' : 'deleted:    ';
            console.log(`\t${statusText}${change.path}`);
        }
    }
    if (hasUnstaged) {
        console.log('');
        console.log('Changes not staged for commit:');
        console.log('  (use "minigit add <file>..." to update what will be committed)');
        console.log('');
        for (const change of result.unstaged) {
            const statusText = change.status === 'modified' ? 'modified:   ' : 'deleted:    ';
            console.log(`\t${statusText}${change.path}`);
        }
    }
    if (hasUntracked) {
        console.log('');
        console.log('Untracked files:');
        console.log('  (use "minigit add <file>..." to include in what will be committed)');
        console.log('');
        for (const file of result.untracked) {
            console.log(`\t${file}`);
        }
    }
    if (!hasStaged && !hasUnstaged && !hasUntracked) {
        console.log('nothing to commit, working tree clean');
    }
}
