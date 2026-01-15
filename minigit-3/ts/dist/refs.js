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
exports.isHeadDetached = isHeadDetached;
exports.getCurrentBranch = getCurrentBranch;
exports.getHeadCommit = getHeadCommit;
exports.readRef = readRef;
exports.writeRef = writeRef;
exports.deleteRef = deleteRef;
exports.listBranches = listBranches;
exports.listTags = listTags;
exports.branchExists = branchExists;
exports.tagExists = tagExists;
exports.createBranch = createBranch;
exports.deleteBranch = deleteBranch;
exports.createTag = createTag;
exports.deleteTag = deleteTag;
exports.updateHead = updateHead;
exports.resolveRef = resolveRef;
exports.getSymbolicRef = getSymbolicRef;
exports.setSymbolicRef = setSymbolicRef;
exports.getCommitMessage = getCommitMessage;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const objects_1 = require("./objects");
function getHead(repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const headPath = path.join(gitDir, 'HEAD');
    return fs.readFileSync(headPath, 'utf-8').trim();
}
function setHead(value, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const headPath = path.join(gitDir, 'HEAD');
    fs.writeFileSync(headPath, value + '\n');
}
function isHeadDetached(repoRoot) {
    const head = getHead(repoRoot);
    return !head.startsWith('ref:');
}
function getCurrentBranch(repoRoot) {
    const head = getHead(repoRoot);
    if (head.startsWith('ref: ')) {
        const ref = head.slice(5);
        if (ref.startsWith('refs/heads/')) {
            return ref.slice(11);
        }
        return ref;
    }
    return null; // Detached HEAD
}
function getHeadCommit(repoRoot) {
    const head = getHead(repoRoot);
    if (head.startsWith('ref: ')) {
        const refPath = head.slice(5);
        return readRef(refPath, repoRoot);
    }
    // Detached HEAD - HEAD contains SHA directly
    return head;
}
function readRef(refPath, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const fullPath = path.join(gitDir, refPath);
    if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8').trim();
        // Check if it's a symbolic ref
        if (content.startsWith('ref: ')) {
            return readRef(content.slice(5), repoRoot);
        }
        return content;
    }
    return null;
}
function writeRef(refPath, sha, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const fullPath = path.join(gitDir, refPath);
    (0, utils_1.ensureDir)(path.dirname(fullPath));
    fs.writeFileSync(fullPath, sha + '\n');
}
function deleteRef(refPath, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const fullPath = path.join(gitDir, refPath);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
    }
    return false;
}
function listBranches(repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const headsDir = path.join(gitDir, 'refs', 'heads');
    if (!fs.existsSync(headsDir)) {
        return [];
    }
    const branches = [];
    const stack = [''];
    while (stack.length > 0) {
        const prefix = stack.pop();
        const dir = prefix ? path.join(headsDir, prefix) : headsDir;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const name = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                stack.push(name);
            }
            else {
                branches.push(name);
            }
        }
    }
    return branches.sort();
}
function listTags(repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const tagsDir = path.join(gitDir, 'refs', 'tags');
    if (!fs.existsSync(tagsDir)) {
        return [];
    }
    const tags = [];
    const stack = [''];
    while (stack.length > 0) {
        const prefix = stack.pop();
        const dir = prefix ? path.join(tagsDir, prefix) : tagsDir;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const name = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                stack.push(name);
            }
            else {
                tags.push(name);
            }
        }
    }
    return tags.sort();
}
function branchExists(name, repoRoot) {
    const sha = readRef(`refs/heads/${name}`, repoRoot);
    return sha !== null;
}
function tagExists(name, repoRoot) {
    const sha = readRef(`refs/tags/${name}`, repoRoot);
    return sha !== null;
}
function createBranch(name, sha, repoRoot) {
    writeRef(`refs/heads/${name}`, sha, repoRoot);
}
function deleteBranch(name, repoRoot) {
    return deleteRef(`refs/heads/${name}`, repoRoot);
}
function createTag(name, sha, repoRoot) {
    writeRef(`refs/tags/${name}`, sha, repoRoot);
}
function deleteTag(name, repoRoot) {
    return deleteRef(`refs/tags/${name}`, repoRoot);
}
function updateHead(sha, repoRoot) {
    const head = getHead(repoRoot);
    if (head.startsWith('ref: ')) {
        const refPath = head.slice(5);
        writeRef(refPath, sha, repoRoot);
    }
    else {
        // Detached HEAD
        setHead(sha, repoRoot);
    }
}
function resolveRef(ref, repoRoot) {
    // Try to resolve in order:
    // 1. HEAD
    // 2. refs/<ref>
    // 3. refs/tags/<ref>
    // 4. refs/heads/<ref>
    // 5. Short SHA
    if (ref === 'HEAD') {
        return getHeadCommit(repoRoot);
    }
    // Check for special syntax HEAD^ or HEAD~n
    const match = ref.match(/^(.+?)(\^+|~(\d+))?(\^\{(\w+)\})?$/);
    if (match) {
        let base = match[1];
        const carets = match[2];
        const tildeN = match[3] ? parseInt(match[3], 10) : 0;
        const objectType = match[5];
        let sha = resolveBaseRef(base, repoRoot);
        if (!sha)
            return null;
        // Handle parent traversal
        if (carets) {
            const count = carets.startsWith('^') ? carets.length : tildeN;
            for (let i = 0; i < count; i++) {
                const obj = (0, objects_1.readObject)(sha, repoRoot);
                if (obj.type !== 'commit') {
                    return null;
                }
                const commit = (0, objects_1.parseCommit)(obj.content);
                if (commit.parents.length === 0) {
                    return null;
                }
                sha = commit.parents[0];
            }
        }
        else if (tildeN > 0) {
            for (let i = 0; i < tildeN; i++) {
                const obj = (0, objects_1.readObject)(sha, repoRoot);
                if (obj.type !== 'commit') {
                    return null;
                }
                const commit = (0, objects_1.parseCommit)(obj.content);
                if (commit.parents.length === 0) {
                    return null;
                }
                sha = commit.parents[0];
            }
        }
        // Handle object type suffix
        if (objectType === 'tree') {
            const obj = (0, objects_1.readObject)(sha, repoRoot);
            if (obj.type === 'commit') {
                const commit = (0, objects_1.parseCommit)(obj.content);
                sha = commit.tree;
            }
            else if (obj.type !== 'tree') {
                return null;
            }
        }
        return sha;
    }
    return resolveBaseRef(ref, repoRoot);
}
function resolveBaseRef(ref, repoRoot) {
    if (ref === 'HEAD') {
        return getHeadCommit(repoRoot);
    }
    // Try refs/heads/<ref>
    let sha = readRef(`refs/heads/${ref}`, repoRoot);
    if (sha)
        return sha;
    // Try refs/tags/<ref>
    sha = readRef(`refs/tags/${ref}`, repoRoot);
    if (sha) {
        // Tags might point to tag objects
        if ((0, objects_1.objectExists)(sha, repoRoot)) {
            const obj = (0, objects_1.readObject)(sha, repoRoot);
            if (obj.type === 'tag') {
                const tag = (0, objects_1.parseTag)(obj.content);
                return tag.object;
            }
        }
        return sha;
    }
    // Try refs/<ref>
    sha = readRef(`refs/${ref}`, repoRoot);
    if (sha)
        return sha;
    // Try full ref path
    sha = readRef(ref, repoRoot);
    if (sha)
        return sha;
    // Try as SHA or short SHA
    if (/^[0-9a-f]+$/.test(ref)) {
        sha = (0, objects_1.resolveShortSha)(ref, repoRoot);
        if (sha)
            return sha;
    }
    return null;
}
function getSymbolicRef(ref, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const refPath = path.join(gitDir, ref);
    if (fs.existsSync(refPath)) {
        const content = fs.readFileSync(refPath, 'utf-8').trim();
        if (content.startsWith('ref: ')) {
            return content.slice(5);
        }
    }
    return null;
}
function setSymbolicRef(ref, target, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const refPath = path.join(gitDir, ref);
    (0, utils_1.ensureDir)(path.dirname(refPath));
    fs.writeFileSync(refPath, `ref: ${target}\n`);
}
function getCommitMessage(sha, repoRoot) {
    const obj = (0, objects_1.readObject)(sha, repoRoot);
    if (obj.type !== 'commit') {
        throw new Error(`Not a commit: ${sha}`);
    }
    const commit = (0, objects_1.parseCommit)(obj.content);
    return commit.message.split('\n')[0]; // First line only
}
