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
exports.readHead = readHead;
exports.writeHead = writeHead;
exports.isDetachedHead = isDetachedHead;
exports.getCurrentBranch = getCurrentBranch;
exports.getHeadCommit = getHeadCommit;
exports.resolveRef = resolveRef;
exports.resolveRevision = resolveRevision;
exports.updateBranch = updateBranch;
exports.deleteBranch = deleteBranch;
exports.branchExists = branchExists;
exports.getBranches = getBranches;
exports.createTag = createTag;
exports.deleteTag = deleteTag;
exports.tagExists = tagExists;
exports.getTags = getTags;
exports.updateRef = updateRef;
exports.readRef = readRef;
exports.writeSymbolicRef = writeSymbolicRef;
exports.readSymbolicRef = readSymbolicRef;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const objects_1 = require("./objects");
function readHead(repoRoot) {
    const headPath = (0, utils_1.getHeadPath)(repoRoot);
    return fs.readFileSync(headPath, 'utf-8').trim();
}
function writeHead(repoRoot, content) {
    const headPath = (0, utils_1.getHeadPath)(repoRoot);
    fs.writeFileSync(headPath, content + '\n');
}
function isDetachedHead(repoRoot) {
    const head = readHead(repoRoot);
    return !head.startsWith('ref:');
}
function getCurrentBranch(repoRoot) {
    const head = readHead(repoRoot);
    if (head.startsWith('ref: refs/heads/')) {
        return head.slice('ref: refs/heads/'.length);
    }
    return null;
}
function getHeadCommit(repoRoot) {
    return resolveRef(repoRoot, 'HEAD');
}
function resolveRef(repoRoot, ref) {
    // Handle special refs
    if (ref === 'HEAD') {
        const head = readHead(repoRoot);
        if (head.startsWith('ref: ')) {
            return resolveRef(repoRoot, head.slice(5));
        }
        // Detached HEAD - direct SHA
        if (/^[0-9a-f]{40}$/.test(head)) {
            return head;
        }
        return null;
    }
    // Handle refs/heads/xxx or refs/tags/xxx
    if (ref.startsWith('refs/')) {
        const refPath = path.join((0, utils_1.getMinigitDir)(repoRoot), ref);
        if (fs.existsSync(refPath)) {
            const sha = fs.readFileSync(refPath, 'utf-8').trim();
            // Handle symbolic refs
            if (sha.startsWith('ref: ')) {
                return resolveRef(repoRoot, sha.slice(5));
            }
            return sha;
        }
        return null;
    }
    // Try branches
    const branchPath = path.join((0, utils_1.getHeadsDir)(repoRoot), ref);
    if (fs.existsSync(branchPath)) {
        return fs.readFileSync(branchPath, 'utf-8').trim();
    }
    // Try tags
    const tagPath = path.join((0, utils_1.getTagsDir)(repoRoot), ref);
    if (fs.existsSync(tagPath)) {
        const sha = fs.readFileSync(tagPath, 'utf-8').trim();
        // Tag might point to annotated tag object
        if ((0, objects_1.objectExists)(repoRoot, sha)) {
            const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
            if (type === 'tag') {
                const tagInfo = (0, objects_1.parseTagContent)(content);
                return tagInfo.object;
            }
        }
        return sha;
    }
    // Try as SHA
    const resolved = (0, objects_1.resolveShortSha)(repoRoot, ref);
    if (resolved) {
        return resolved;
    }
    return null;
}
function resolveRevision(repoRoot, rev) {
    // Handle commit^{tree} syntax
    if (rev.endsWith('^{tree}')) {
        const commitRef = rev.slice(0, -7);
        const commitSha = resolveRevision(repoRoot, commitRef);
        if (!commitSha)
            return null;
        const { type, content } = (0, objects_1.readObject)(repoRoot, commitSha);
        if (type === 'commit') {
            const commitInfo = (0, objects_1.parseCommitContent)(content);
            return commitInfo.tree;
        }
        return null;
    }
    // Handle HEAD:path or ref:path syntax
    if (rev.includes(':')) {
        const [refPart, pathPart] = rev.split(':');
        const commitSha = resolveRevision(repoRoot, refPart);
        if (!commitSha)
            return null;
        return resolvePathInCommit(repoRoot, commitSha, pathPart);
    }
    // Handle parent references (^ and ~)
    const parentMatch = rev.match(/^(.+?)(\^+|~(\d+))$/);
    if (parentMatch) {
        const base = parentMatch[1];
        const baseSha = resolveRevision(repoRoot, base);
        if (!baseSha)
            return null;
        if (parentMatch[2].startsWith('^')) {
            // Each ^ goes to first parent
            let sha = baseSha;
            for (let i = 0; i < parentMatch[2].length; i++) {
                const parent = getParent(repoRoot, sha, 0);
                if (!parent)
                    return null;
                sha = parent;
            }
            return sha;
        }
        else {
            // ~N goes N parents back
            const count = parseInt(parentMatch[3], 10);
            let sha = baseSha;
            for (let i = 0; i < count; i++) {
                const parent = getParent(repoRoot, sha, 0);
                if (!parent)
                    return null;
                sha = parent;
            }
            return sha;
        }
    }
    // Regular ref resolution
    return resolveRef(repoRoot, rev);
}
function getParent(repoRoot, sha, index) {
    if (!(0, objects_1.objectExists)(repoRoot, sha))
        return null;
    const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
    if (type !== 'commit')
        return null;
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    if (index < commitInfo.parents.length) {
        return commitInfo.parents[index];
    }
    return null;
}
function resolvePathInCommit(repoRoot, commitSha, filePath) {
    const { type, content } = (0, objects_1.readObject)(repoRoot, commitSha);
    if (type !== 'commit')
        return null;
    const commitInfo = (0, objects_1.parseCommitContent)(content);
    return resolvePathInTree(repoRoot, commitInfo.tree, filePath);
}
function resolvePathInTree(repoRoot, treeSha, filePath) {
    const parts = filePath.split('/').filter((p) => p);
    let currentSha = treeSha;
    for (let i = 0; i < parts.length; i++) {
        const { type, content } = (0, objects_1.readObject)(repoRoot, currentSha);
        if (type !== 'tree')
            return null;
        const { parseTreeContent } = require('./objects');
        const entries = parseTreeContent(content);
        const entry = entries.find((e) => e.name === parts[i]);
        if (!entry)
            return null;
        currentSha = entry.sha;
    }
    return currentSha;
}
function updateBranch(repoRoot, branchName, sha) {
    const branchPath = path.join((0, utils_1.getHeadsDir)(repoRoot), branchName);
    (0, utils_1.ensureDir)(path.dirname(branchPath));
    fs.writeFileSync(branchPath, sha + '\n');
}
function deleteBranch(repoRoot, branchName) {
    const branchPath = path.join((0, utils_1.getHeadsDir)(repoRoot), branchName);
    if (fs.existsSync(branchPath)) {
        fs.unlinkSync(branchPath);
        return true;
    }
    return false;
}
function branchExists(repoRoot, branchName) {
    const branchPath = path.join((0, utils_1.getHeadsDir)(repoRoot), branchName);
    return fs.existsSync(branchPath);
}
function getBranches(repoRoot) {
    const headsDir = (0, utils_1.getHeadsDir)(repoRoot);
    if (!fs.existsSync(headsDir)) {
        return [];
    }
    const branches = [];
    readBranchesRecursive(headsDir, '', branches);
    return branches.sort();
}
function readBranchesRecursive(dir, prefix, branches) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            readBranchesRecursive(path.join(dir, entry.name), name, branches);
        }
        else if (entry.isFile()) {
            branches.push(name);
        }
    }
}
function createTag(repoRoot, tagName, sha) {
    const tagPath = path.join((0, utils_1.getTagsDir)(repoRoot), tagName);
    (0, utils_1.ensureDir)(path.dirname(tagPath));
    fs.writeFileSync(tagPath, sha + '\n');
}
function deleteTag(repoRoot, tagName) {
    const tagPath = path.join((0, utils_1.getTagsDir)(repoRoot), tagName);
    if (fs.existsSync(tagPath)) {
        fs.unlinkSync(tagPath);
        return true;
    }
    return false;
}
function tagExists(repoRoot, tagName) {
    const tagPath = path.join((0, utils_1.getTagsDir)(repoRoot), tagName);
    return fs.existsSync(tagPath);
}
function getTags(repoRoot) {
    const tagsDir = (0, utils_1.getTagsDir)(repoRoot);
    if (!fs.existsSync(tagsDir)) {
        return [];
    }
    const tags = [];
    const entries = fs.readdirSync(tagsDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile()) {
            tags.push(entry.name);
        }
    }
    return tags.sort();
}
function updateRef(repoRoot, refPath, sha) {
    const fullPath = path.join((0, utils_1.getMinigitDir)(repoRoot), refPath);
    (0, utils_1.ensureDir)(path.dirname(fullPath));
    fs.writeFileSync(fullPath, sha + '\n');
}
function readRef(repoRoot, refPath) {
    const fullPath = path.join((0, utils_1.getMinigitDir)(repoRoot), refPath);
    if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf-8').trim();
    }
    return null;
}
function writeSymbolicRef(repoRoot, name, target) {
    const refPath = name === 'HEAD' ? (0, utils_1.getHeadPath)(repoRoot) : path.join((0, utils_1.getMinigitDir)(repoRoot), name);
    fs.writeFileSync(refPath, `ref: ${target}\n`);
}
function readSymbolicRef(repoRoot, name) {
    const refPath = name === 'HEAD' ? (0, utils_1.getHeadPath)(repoRoot) : path.join((0, utils_1.getMinigitDir)(repoRoot), name);
    if (!fs.existsSync(refPath)) {
        return null;
    }
    const content = fs.readFileSync(refPath, 'utf-8').trim();
    if (content.startsWith('ref: ')) {
        return content.slice(5);
    }
    return null;
}
