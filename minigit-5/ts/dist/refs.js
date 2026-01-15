"use strict";
// Reference management (HEAD, branches, tags)
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
exports.getHead = getHead;
exports.setHead = setHead;
exports.isDetachedHead = isDetachedHead;
exports.getCurrentBranch = getCurrentBranch;
exports.getHeadCommit = getHeadCommit;
exports.resolveRef = resolveRef;
exports.updateRef = updateRef;
exports.deleteRef = deleteRef;
exports.refExists = refExists;
exports.createBranch = createBranch;
exports.deleteBranch = deleteBranch;
exports.renameBranch = renameBranch;
exports.listBranches = listBranches;
exports.createTag = createTag;
exports.deleteTag = deleteTag;
exports.listTags = listTags;
exports.resolveRevision = resolveRevision;
exports.getSymbolicRef = getSymbolicRef;
exports.setSymbolicRef = setSymbolicRef;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const objects_1 = require("./objects");
function getHead(repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const headPath = path.join(minigitDir, 'HEAD');
    return fs.readFileSync(headPath, 'utf8').trim();
}
function setHead(value, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const headPath = path.join(minigitDir, 'HEAD');
    fs.writeFileSync(headPath, value + '\n');
}
function isDetachedHead(repoRoot) {
    const head = getHead(repoRoot);
    return !head.startsWith('ref:');
}
function getCurrentBranch(repoRoot) {
    const head = getHead(repoRoot);
    if (head.startsWith('ref:')) {
        const ref = head.slice(5).trim();
        if (ref.startsWith('refs/heads/')) {
            return ref.slice(11);
        }
        return ref;
    }
    return null; // Detached HEAD
}
function getHeadCommit(repoRoot) {
    const head = getHead(repoRoot);
    if (head.startsWith('ref:')) {
        const ref = head.slice(5).trim();
        return resolveRef(ref, repoRoot);
    }
    // Detached HEAD - head is the SHA
    return head;
}
function resolveRef(ref, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    if (fs.existsSync(refPath)) {
        const content = fs.readFileSync(refPath, 'utf8').trim();
        // Could be a symbolic ref or a SHA
        if (content.startsWith('ref:')) {
            return resolveRef(content.slice(5).trim(), repoRoot);
        }
        return content;
    }
    return null;
}
function updateRef(ref, sha, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    (0, utils_1.ensureDir)(path.dirname(refPath));
    fs.writeFileSync(refPath, sha + '\n');
}
function deleteRef(ref, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    if (fs.existsSync(refPath)) {
        fs.unlinkSync(refPath);
        return true;
    }
    return false;
}
function refExists(ref, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    return fs.existsSync(refPath);
}
function createBranch(name, sha, repoRoot) {
    const ref = `refs/heads/${name}`;
    if (refExists(ref, repoRoot)) {
        throw new Error(`A branch named '${name}' already exists.`);
    }
    updateRef(ref, sha, repoRoot);
}
function deleteBranch(name, repoRoot) {
    const ref = `refs/heads/${name}`;
    if (!deleteRef(ref, repoRoot)) {
        throw new Error(`Branch '${name}' not found.`);
    }
}
function renameBranch(oldName, newName, repoRoot) {
    const oldRef = `refs/heads/${oldName}`;
    const newRef = `refs/heads/${newName}`;
    const sha = resolveRef(oldRef, repoRoot);
    if (!sha) {
        throw new Error(`Branch '${oldName}' not found.`);
    }
    if (refExists(newRef, repoRoot)) {
        throw new Error(`A branch named '${newName}' already exists.`);
    }
    updateRef(newRef, sha, repoRoot);
    deleteRef(oldRef, repoRoot);
    // Update HEAD if we renamed the current branch
    const head = getHead(repoRoot);
    if (head === `ref: ${oldRef}`) {
        setHead(`ref: ${newRef}`, repoRoot);
    }
}
function listBranches(repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const headsDir = path.join(minigitDir, 'refs', 'heads');
    if (!fs.existsSync(headsDir)) {
        return [];
    }
    return listRefsRecursive(headsDir, '');
}
function listRefsRecursive(baseDir, prefix) {
    const result = [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            result.push(...listRefsRecursive(path.join(baseDir, entry.name), name));
        }
        else {
            result.push(name);
        }
    }
    return result;
}
function createTag(name, sha, repoRoot) {
    const ref = `refs/tags/${name}`;
    if (refExists(ref, repoRoot)) {
        throw new Error(`Tag '${name}' already exists.`);
    }
    updateRef(ref, sha, repoRoot);
}
function deleteTag(name, repoRoot) {
    const ref = `refs/tags/${name}`;
    if (!deleteRef(ref, repoRoot)) {
        throw new Error(`Tag '${name}' not found.`);
    }
}
function listTags(repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const tagsDir = path.join(minigitDir, 'refs', 'tags');
    if (!fs.existsSync(tagsDir)) {
        return [];
    }
    return listRefsRecursive(tagsDir, '');
}
// Resolve a revision to a commit SHA
function resolveRevision(revision, repoRoot) {
    // Handle special suffixes
    const treeMatch = revision.match(/^(.+)\^\{tree\}$/);
    if (treeMatch) {
        const baseSha = resolveRevision(treeMatch[1], repoRoot);
        return (0, objects_1.getTreeFromTreeIsh)(baseSha, repoRoot);
    }
    // Handle colon path syntax (e.g., HEAD:file.txt)
    const colonMatch = revision.match(/^(.+):(.+)$/);
    if (colonMatch) {
        const baseSha = resolveRevision(colonMatch[1], repoRoot);
        return resolvePathInTree(baseSha, colonMatch[2], repoRoot);
    }
    // Handle parent traversal
    const parentMatch = revision.match(/^(.+)\^(\d*)$/);
    if (parentMatch) {
        const baseSha = resolveRevision(parentMatch[1], repoRoot);
        const parentNum = parentMatch[2] ? parseInt(parentMatch[2], 10) : 1;
        return getParent(baseSha, parentNum, repoRoot);
    }
    // Handle ancestor traversal (HEAD~2)
    const ancestorMatch = revision.match(/^(.+)~(\d+)$/);
    if (ancestorMatch) {
        let sha = resolveRevision(ancestorMatch[1], repoRoot);
        const count = parseInt(ancestorMatch[2], 10);
        for (let i = 0; i < count; i++) {
            sha = getParent(sha, 1, repoRoot);
        }
        return sha;
    }
    // Handle HEAD
    if (revision === 'HEAD') {
        const sha = getHeadCommit(repoRoot);
        if (!sha) {
            throw new Error('HEAD does not point to a commit');
        }
        return sha;
    }
    // Try as branch name
    const branchSha = resolveRef(`refs/heads/${revision}`, repoRoot);
    if (branchSha) {
        return branchSha;
    }
    // Try as tag name
    const tagSha = resolveRef(`refs/tags/${revision}`, repoRoot);
    if (tagSha) {
        // If tag points to a tag object, resolve to the commit
        try {
            const { type, content } = (0, objects_1.readObject)(tagSha, repoRoot);
            if (type === 'tag') {
                const tag = (0, objects_1.parseTag)(content);
                return tag.object;
            }
        }
        catch {
            // Not a valid object, ignore
        }
        return tagSha;
    }
    // Try as SHA (full or abbreviated)
    try {
        return (0, objects_1.expandShortSha)(revision, repoRoot);
    }
    catch {
        throw new Error(`Unknown revision: ${revision}`);
    }
}
function getParent(sha, parentNum, repoRoot) {
    const commit = (0, objects_1.getCommit)(sha, repoRoot);
    if (parentNum < 1 || parentNum > commit.parents.length) {
        throw new Error(`Commit ${sha.slice(0, 7)} has no parent ${parentNum}`);
    }
    return commit.parents[parentNum - 1];
}
function resolvePathInTree(commitOrTreeSha, filePath, repoRoot) {
    const { getTree, readObject } = require('./objects');
    const { type, content } = readObject(commitOrTreeSha, repoRoot);
    let treeSha;
    if (type === 'commit') {
        const { parseCommit } = require('./objects');
        const commit = parseCommit(content);
        treeSha = commit.tree;
    }
    else if (type === 'tree') {
        treeSha = commitOrTreeSha;
    }
    else {
        throw new Error(`Cannot resolve path in ${type}`);
    }
    const parts = filePath.split('/');
    let currentTreeSha = treeSha;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const entries = getTree(currentTreeSha, repoRoot);
        const entry = entries.find((e) => e.name === part);
        if (!entry) {
            throw new Error(`Path '${filePath}' does not exist`);
        }
        if (i === parts.length - 1) {
            return entry.sha;
        }
        if (entry.mode !== '40000') {
            throw new Error(`'${parts.slice(0, i + 1).join('/')}' is not a directory`);
        }
        currentTreeSha = entry.sha;
    }
    return currentTreeSha;
}
function getSymbolicRef(ref, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    if (!fs.existsSync(refPath)) {
        return null;
    }
    const content = fs.readFileSync(refPath, 'utf8').trim();
    if (content.startsWith('ref:')) {
        return content.slice(5).trim();
    }
    return null;
}
function setSymbolicRef(ref, target, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const refPath = path.join(minigitDir, ref);
    (0, utils_1.ensureDir)(path.dirname(refPath));
    fs.writeFileSync(refPath, `ref: ${target}\n`);
}
