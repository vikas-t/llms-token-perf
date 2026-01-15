"use strict";
// Git object storage: Blob, Tree, Commit, Tag handling
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
exports.hashObject = hashObject;
exports.writeObject = writeObject;
exports.readObject = readObject;
exports.objectExists = objectExists;
exports.expandShortSha = expandShortSha;
exports.createBlob = createBlob;
exports.parseTree = parseTree;
exports.serializeTree = serializeTree;
exports.createTree = createTree;
exports.parseCommit = parseCommit;
exports.serializeCommit = serializeCommit;
exports.createCommit = createCommit;
exports.parseTag = parseTag;
exports.serializeTag = serializeTag;
exports.createTag = createTag;
exports.getObjectType = getObjectType;
exports.getObjectSize = getObjectSize;
exports.getBlob = getBlob;
exports.getTree = getTree;
exports.getCommit = getCommit;
exports.getTagObject = getTagObject;
exports.getTreeFromTreeIsh = getTreeFromTreeIsh;
exports.walkTree = walkTree;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
function hashObject(type, content) {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const store = Buffer.concat([header, content]);
    return (0, utils_1.sha1)(store);
}
function writeObject(type, content, repoRoot) {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const store = Buffer.concat([header, content]);
    const objectSha = (0, utils_1.sha1)(store);
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const objectDir = path.join(minigitDir, 'objects', objectSha.slice(0, 2));
    (0, utils_1.ensureDir)(objectDir);
    const objectPath = path.join(objectDir, objectSha.slice(2));
    if (!fs.existsSync(objectPath)) {
        const compressed = (0, utils_1.compress)(store);
        fs.writeFileSync(objectPath, compressed);
    }
    return objectSha;
}
function readObject(sha, repoRoot) {
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const objectPath = path.join(minigitDir, 'objects', sha.slice(0, 2), sha.slice(2));
    if (!fs.existsSync(objectPath)) {
        throw new Error(`Object not found: ${sha}`);
    }
    const compressed = fs.readFileSync(objectPath);
    const raw = (0, utils_1.decompress)(compressed);
    // Parse header: "type size\0content"
    const nullIndex = raw.indexOf(0);
    if (nullIndex === -1) {
        throw new Error(`Invalid object: ${sha}`);
    }
    const header = raw.slice(0, nullIndex).toString();
    const [type] = header.split(' ');
    const content = raw.slice(nullIndex + 1);
    return { type, content };
}
function objectExists(sha, repoRoot) {
    try {
        const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
        const objectPath = path.join(minigitDir, 'objects', sha.slice(0, 2), sha.slice(2));
        return fs.existsSync(objectPath);
    }
    catch {
        return false;
    }
}
function expandShortSha(shortSha, repoRoot) {
    if (shortSha.length === 40) {
        return shortSha;
    }
    const minigitDir = (0, utils_1.getMinigitDir)(repoRoot);
    const objectsDir = path.join(minigitDir, 'objects');
    if (shortSha.length < 4) {
        throw new Error(`SHA too short: ${shortSha}`);
    }
    const prefix = shortSha.slice(0, 2);
    const rest = shortSha.slice(2);
    const searchDir = path.join(objectsDir, prefix);
    if (!fs.existsSync(searchDir)) {
        throw new Error(`Object not found: ${shortSha}`);
    }
    const matches = fs.readdirSync(searchDir).filter(name => name.startsWith(rest));
    if (matches.length === 0) {
        throw new Error(`Object not found: ${shortSha}`);
    }
    if (matches.length > 1) {
        throw new Error(`Ambiguous SHA: ${shortSha}`);
    }
    return prefix + matches[0];
}
function createBlob(content, write = false, repoRoot) {
    if (write) {
        return writeObject('blob', content, repoRoot);
    }
    return hashObject('blob', content);
}
function parseTree(content) {
    const entries = [];
    let offset = 0;
    while (offset < content.length) {
        // Find space after mode
        const spaceIndex = content.indexOf(0x20, offset);
        if (spaceIndex === -1)
            break;
        const mode = content.slice(offset, spaceIndex).toString();
        // Find null after name
        const nullIndex = content.indexOf(0, spaceIndex + 1);
        if (nullIndex === -1)
            break;
        const name = content.slice(spaceIndex + 1, nullIndex).toString();
        // Next 20 bytes are SHA (binary)
        const shaBytes = content.slice(nullIndex + 1, nullIndex + 21);
        const sha = shaBytes.toString('hex');
        entries.push({ mode, name, sha });
        offset = nullIndex + 21;
    }
    return entries;
}
function serializeTree(entries) {
    // Sort entries: directories (trees) come after files with same prefix
    const sorted = entries.slice().sort((a, b) => {
        // For sorting, append / to directory names (mode 40000)
        const aName = a.mode === '40000' ? a.name + '/' : a.name;
        const bName = b.mode === '40000' ? b.name + '/' : b.name;
        return aName.localeCompare(bName);
    });
    const parts = [];
    for (const entry of sorted) {
        // Mode (no leading zeros for directories: 40000 not 040000)
        const mode = entry.mode === '40000' ? '40000' : entry.mode;
        const header = Buffer.from(`${mode} ${entry.name}\0`);
        const sha = Buffer.from(entry.sha, 'hex');
        parts.push(header, sha);
    }
    return Buffer.concat(parts);
}
function createTree(entries, repoRoot) {
    const content = serializeTree(entries);
    return writeObject('tree', content, repoRoot);
}
function parseCommit(content) {
    const lines = content.toString().split('\n');
    let tree = '';
    const parents = [];
    let author = '';
    let committer = '';
    let message = '';
    let inMessage = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (inMessage) {
            message += (message ? '\n' : '') + line;
        }
        else if (line === '') {
            inMessage = true;
        }
        else if (line.startsWith('tree ')) {
            tree = line.slice(5);
        }
        else if (line.startsWith('parent ')) {
            parents.push(line.slice(7));
        }
        else if (line.startsWith('author ')) {
            author = line.slice(7);
        }
        else if (line.startsWith('committer ')) {
            committer = line.slice(10);
        }
    }
    return { type: 'commit', tree, parents, author, committer, message };
}
function serializeCommit(commit) {
    let content = `tree ${commit.tree}\n`;
    for (const parent of commit.parents) {
        content += `parent ${parent}\n`;
    }
    content += `author ${commit.author}\n`;
    content += `committer ${commit.committer}\n`;
    content += `\n${commit.message}`;
    return Buffer.from(content);
}
function createCommit(tree, parents, author, committer, message, repoRoot) {
    const content = serializeCommit({ tree, parents, author, committer, message });
    return writeObject('commit', content, repoRoot);
}
function parseTag(content) {
    const lines = content.toString().split('\n');
    let object = '';
    let objectType = '';
    let tagName = '';
    let tagger = '';
    let message = '';
    let inMessage = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (inMessage) {
            message += (message ? '\n' : '') + line;
        }
        else if (line === '') {
            inMessage = true;
        }
        else if (line.startsWith('object ')) {
            object = line.slice(7);
        }
        else if (line.startsWith('type ')) {
            objectType = line.slice(5);
        }
        else if (line.startsWith('tag ')) {
            tagName = line.slice(4);
        }
        else if (line.startsWith('tagger ')) {
            tagger = line.slice(7);
        }
    }
    return { type: 'tag', object, objectType, tagName, tagger, message };
}
function serializeTag(tag) {
    let content = `object ${tag.object}\n`;
    content += `type ${tag.objectType}\n`;
    content += `tag ${tag.tagName}\n`;
    content += `tagger ${tag.tagger}\n`;
    content += `\n${tag.message}`;
    return Buffer.from(content);
}
function createTag(object, objectType, tagName, tagger, message, repoRoot) {
    const content = serializeTag({ object, objectType, tagName, tagger, message });
    return writeObject('tag', content, repoRoot);
}
function getObjectType(sha, repoRoot) {
    const { type } = readObject(sha, repoRoot);
    return type;
}
function getObjectSize(sha, repoRoot) {
    const { content } = readObject(sha, repoRoot);
    return content.length;
}
function getBlob(sha, repoRoot) {
    const { type, content } = readObject(sha, repoRoot);
    if (type !== 'blob') {
        throw new Error(`Expected blob, got ${type}`);
    }
    return content;
}
function getTree(sha, repoRoot) {
    const { type, content } = readObject(sha, repoRoot);
    if (type !== 'tree') {
        throw new Error(`Expected tree, got ${type}`);
    }
    return parseTree(content);
}
function getCommit(sha, repoRoot) {
    const { type, content } = readObject(sha, repoRoot);
    if (type !== 'commit') {
        throw new Error(`Expected commit, got ${type}`);
    }
    return parseCommit(content);
}
function getTagObject(sha, repoRoot) {
    const { type, content } = readObject(sha, repoRoot);
    if (type !== 'tag') {
        throw new Error(`Expected tag, got ${type}`);
    }
    return parseTag(content);
}
// Get tree SHA from a tree-ish (commit, tag, or tree)
function getTreeFromTreeIsh(sha, repoRoot) {
    const { type, content } = readObject(sha, repoRoot);
    if (type === 'tree') {
        return sha;
    }
    if (type === 'commit') {
        const commit = parseCommit(content);
        return commit.tree;
    }
    if (type === 'tag') {
        const tag = parseTag(content);
        return getTreeFromTreeIsh(tag.object, repoRoot);
    }
    throw new Error(`Cannot get tree from ${type}`);
}
// Walk a tree recursively and return all blob paths with their SHAs
function walkTree(treeSha, prefix = '', repoRoot) {
    const result = new Map();
    const entries = getTree(treeSha, repoRoot);
    for (const entry of entries) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            // Directory - recurse
            const subMap = walkTree(entry.sha, fullPath, repoRoot);
            subMap.forEach((value, key) => result.set(key, value));
        }
        else {
            result.set(fullPath, { sha: entry.sha, mode: entry.mode });
        }
    }
    return result;
}
