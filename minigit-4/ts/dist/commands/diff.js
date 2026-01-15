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
const objects_1 = require("../objects");
const refs_1 = require("../refs");
const diff_algo_1 = require("../diff-algo");
function diff(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let cached = false;
    let showStat = false;
    const commits = [];
    const paths = [];
    let inPathSpec = false;
    for (const arg of args) {
        if (arg === '--') {
            inPathSpec = true;
        }
        else if (inPathSpec) {
            paths.push(arg);
        }
        else if (arg === '--cached' || arg === '--staged') {
            cached = true;
        }
        else if (arg === '--stat') {
            showStat = true;
        }
        else if (!arg.startsWith('-')) {
            commits.push(arg);
        }
    }
    let output;
    if (commits.length === 2) {
        // Diff between two commits
        output = diffBetweenCommits(repoRoot, commits[0], commits[1], paths);
    }
    else if (commits.length === 1) {
        // Diff between commit and working tree
        output = diffCommitToWorkingTree(repoRoot, commits[0], paths);
    }
    else if (cached) {
        // Diff between HEAD and index (staged changes)
        output = diffHeadToIndex(repoRoot, paths);
    }
    else {
        // Diff between index and working tree (unstaged changes)
        output = diffIndexToWorkingTree(repoRoot, paths);
    }
    if (output) {
        console.log(output.trimEnd());
    }
    return 0;
}
function diffIndexToWorkingTree(repoRoot, filterPaths) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const diffs = [];
    for (const entry of entries) {
        if (filterPaths.length > 0 && !matchesPath(entry.name, filterPaths)) {
            continue;
        }
        const fullPath = path.join(repoRoot, entry.name);
        if (!fs.existsSync(fullPath)) {
            // File deleted
            const { content: oldContent } = (0, objects_1.readObject)(repoRoot, entry.sha);
            if ((0, utils_1.isBinaryFile)(oldContent)) {
                diffs.push(`Binary file ${entry.name} deleted`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(entry.name, entry.name, oldContent.toString(), ''));
            }
            continue;
        }
        const stat = fs.lstatSync(fullPath);
        let workingContent;
        if (stat.isSymbolicLink()) {
            workingContent = Buffer.from(fs.readlinkSync(fullPath));
        }
        else {
            workingContent = fs.readFileSync(fullPath);
        }
        const workingBlobContent = (0, objects_1.createBlobContent)(workingContent);
        const workingSha = (0, objects_1.hashObject)(workingBlobContent);
        if (workingSha !== entry.sha) {
            const { content: indexContent } = (0, objects_1.readObject)(repoRoot, entry.sha);
            if ((0, utils_1.isBinaryFile)(indexContent) || (0, utils_1.isBinaryFile)(workingContent)) {
                diffs.push(`Binary files a/${entry.name} and b/${entry.name} differ`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(entry.name, entry.name, indexContent.toString(), workingContent.toString()));
            }
        }
    }
    return diffs.join('');
}
function diffHeadToIndex(repoRoot, filterPaths) {
    const entries = (0, index_file_1.readIndex)(repoRoot);
    const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
    // Get HEAD tree files
    const headFiles = new Map();
    if (headCommit) {
        const { content } = (0, objects_1.readObject)(repoRoot, headCommit);
        const commitInfo = (0, objects_1.parseCommitContent)(content);
        collectTreeFiles(repoRoot, commitInfo.tree, '', headFiles);
    }
    const diffs = [];
    // Check index files
    for (const entry of entries) {
        if (filterPaths.length > 0 && !matchesPath(entry.name, filterPaths)) {
            continue;
        }
        const headSha = headFiles.get(entry.name);
        if (!headSha) {
            // New file
            const { content } = (0, objects_1.readObject)(repoRoot, entry.sha);
            if ((0, utils_1.isBinaryFile)(content)) {
                diffs.push(`Binary file ${entry.name} added`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)('/dev/null', entry.name, '', content.toString()));
            }
        }
        else if (headSha !== entry.sha) {
            // Modified
            const { content: headContent } = (0, objects_1.readObject)(repoRoot, headSha);
            const { content: indexContent } = (0, objects_1.readObject)(repoRoot, entry.sha);
            if ((0, utils_1.isBinaryFile)(headContent) || (0, utils_1.isBinaryFile)(indexContent)) {
                diffs.push(`Binary files a/${entry.name} and b/${entry.name} differ`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(entry.name, entry.name, headContent.toString(), indexContent.toString()));
            }
        }
        headFiles.delete(entry.name);
    }
    // Check for deleted files (in HEAD but not in index)
    for (const [name, sha] of headFiles) {
        if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
            continue;
        }
        const { content } = (0, objects_1.readObject)(repoRoot, sha);
        if ((0, utils_1.isBinaryFile)(content)) {
            diffs.push(`Binary file ${name} deleted`);
        }
        else {
            diffs.push((0, diff_algo_1.formatUnifiedDiff)(name, '/dev/null', content.toString(), ''));
        }
    }
    return diffs.join('');
}
function diffBetweenCommits(repoRoot, ref1, ref2, filterPaths) {
    const sha1 = (0, refs_1.resolveRevision)(repoRoot, ref1);
    const sha2 = (0, refs_1.resolveRevision)(repoRoot, ref2);
    if (!sha1 || !sha2) {
        return '';
    }
    const files1 = new Map();
    const files2 = new Map();
    const { content: content1 } = (0, objects_1.readObject)(repoRoot, sha1);
    const commitInfo1 = (0, objects_1.parseCommitContent)(content1);
    collectTreeFiles(repoRoot, commitInfo1.tree, '', files1);
    const { content: content2 } = (0, objects_1.readObject)(repoRoot, sha2);
    const commitInfo2 = (0, objects_1.parseCommitContent)(content2);
    collectTreeFiles(repoRoot, commitInfo2.tree, '', files2);
    return diffFileMaps(repoRoot, files1, files2, filterPaths);
}
function diffCommitToWorkingTree(repoRoot, ref, filterPaths) {
    const sha = (0, refs_1.resolveRevision)(repoRoot, ref);
    if (!sha) {
        return '';
    }
    const commitFiles = new Map();
    const { content } = (0, objects_1.readObject)(repoRoot, sha);
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    collectTreeFiles(repoRoot, commitInfo.tree, '', commitFiles);
    const diffs = [];
    // Compare commit files to working tree
    for (const [name, fileSha] of commitFiles) {
        if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
            continue;
        }
        const fullPath = path.join(repoRoot, name);
        if (!fs.existsSync(fullPath)) {
            // Deleted
            const { content: fileContent } = (0, objects_1.readObject)(repoRoot, fileSha);
            if ((0, utils_1.isBinaryFile)(fileContent)) {
                diffs.push(`Binary file ${name} deleted`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(name, '/dev/null', fileContent.toString(), ''));
            }
        }
        else {
            const stat = fs.lstatSync(fullPath);
            let workingContent;
            if (stat.isSymbolicLink()) {
                workingContent = Buffer.from(fs.readlinkSync(fullPath));
            }
            else {
                workingContent = fs.readFileSync(fullPath);
            }
            const { content: commitFileContent } = (0, objects_1.readObject)(repoRoot, fileSha);
            if ((0, utils_1.isBinaryFile)(commitFileContent) || (0, utils_1.isBinaryFile)(workingContent)) {
                const workingBlobContent = (0, objects_1.createBlobContent)(workingContent);
                const workingSha = (0, objects_1.hashObject)(workingBlobContent);
                if (workingSha !== fileSha) {
                    diffs.push(`Binary files a/${name} and b/${name} differ`);
                }
            }
            else {
                const commitStr = commitFileContent.toString();
                const workingStr = workingContent.toString();
                if (commitStr !== workingStr) {
                    diffs.push((0, diff_algo_1.formatUnifiedDiff)(name, name, commitStr, workingStr));
                }
            }
        }
    }
    return diffs.join('');
}
function diffFileMaps(repoRoot, files1, files2, filterPaths) {
    const diffs = [];
    const allFiles = new Set([...files1.keys(), ...files2.keys()]);
    for (const name of [...allFiles].sort()) {
        if (filterPaths.length > 0 && !matchesPath(name, filterPaths)) {
            continue;
        }
        const sha1 = files1.get(name);
        const sha2 = files2.get(name);
        if (!sha1) {
            // Added in files2
            const { content } = (0, objects_1.readObject)(repoRoot, sha2);
            if ((0, utils_1.isBinaryFile)(content)) {
                diffs.push(`Binary file ${name} added`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)('/dev/null', name, '', content.toString()));
            }
        }
        else if (!sha2) {
            // Deleted in files2
            const { content } = (0, objects_1.readObject)(repoRoot, sha1);
            if ((0, utils_1.isBinaryFile)(content)) {
                diffs.push(`Binary file ${name} deleted`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(name, '/dev/null', content.toString(), ''));
            }
        }
        else if (sha1 !== sha2) {
            // Modified
            const { content: content1 } = (0, objects_1.readObject)(repoRoot, sha1);
            const { content: content2 } = (0, objects_1.readObject)(repoRoot, sha2);
            if ((0, utils_1.isBinaryFile)(content1) || (0, utils_1.isBinaryFile)(content2)) {
                diffs.push(`Binary files a/${name} and b/${name} differ`);
            }
            else {
                diffs.push((0, diff_algo_1.formatUnifiedDiff)(name, name, content1.toString(), content2.toString()));
            }
        }
    }
    return diffs.join('');
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
function matchesPath(name, filterPaths) {
    for (const filter of filterPaths) {
        if (name === filter || name.startsWith(filter + '/')) {
            return true;
        }
    }
    return false;
}
