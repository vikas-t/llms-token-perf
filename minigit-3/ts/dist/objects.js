"use strict";
// Git object handling: Blob, Tree, Commit, Tag
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
exports.createBlobContent = createBlobContent;
exports.createTreeContent = createTreeContent;
exports.createCommitContent = createCommitContent;
exports.createTagContent = createTagContent;
exports.hashObject = hashObject;
exports.writeObject = writeObject;
exports.readObject = readObject;
exports.objectExists = objectExists;
exports.resolveShortSha = resolveShortSha;
exports.parseTree = parseTree;
exports.parseCommit = parseCommit;
exports.parseTag = parseTag;
exports.writeBlob = writeBlob;
exports.writeTree = writeTree;
exports.writeCommit = writeCommit;
exports.writeTag = writeTag;
exports.getObjectType = getObjectType;
exports.getObjectSize = getObjectSize;
exports.prettyPrintObject = prettyPrintObject;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
function createBlobContent(data) {
    const header = `blob ${data.length}\0`;
    return Buffer.concat([Buffer.from(header), data]);
}
function createTreeContent(entries) {
    // Sort entries: directories and files sorted alphabetically
    // Git sorts with trailing / for directories
    const sorted = [...entries].sort((a, b) => {
        const aName = a.type === 'tree' ? a.name + '/' : a.name;
        const bName = b.type === 'tree' ? b.name + '/' : b.name;
        return aName.localeCompare(bName);
    });
    const parts = [];
    for (const entry of sorted) {
        // Format: mode name\0sha(20 bytes)
        const mode = entry.mode.replace(/^0+/, ''); // Remove leading zeros for compatibility
        const header = `${mode} ${entry.name}\0`;
        const shaBytes = Buffer.from(entry.sha, 'hex');
        parts.push(Buffer.from(header));
        parts.push(shaBytes);
    }
    const content = Buffer.concat(parts);
    const header = `tree ${content.length}\0`;
    return Buffer.concat([Buffer.from(header), content]);
}
function createCommitContent(commit) {
    let content = `tree ${commit.tree}\n`;
    for (const parent of commit.parents) {
        content += `parent ${parent}\n`;
    }
    content += `author ${commit.author}\n`;
    content += `committer ${commit.committer}\n`;
    content += `\n${commit.message}`;
    const header = `commit ${Buffer.byteLength(content)}\0`;
    return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}
function createTagContent(tag) {
    let content = `object ${tag.object}\n`;
    content += `type ${tag.type}\n`;
    content += `tag ${tag.tag}\n`;
    content += `tagger ${tag.tagger}\n`;
    content += `\n${tag.message}`;
    const header = `tag ${Buffer.byteLength(content)}\0`;
    return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}
function hashObject(content) {
    return (0, utils_1.sha1)(content);
}
function writeObject(content, repoRoot) {
    const hash = hashObject(content);
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const objectDir = path.join(gitDir, 'objects', hash.slice(0, 2));
    const objectPath = path.join(objectDir, hash.slice(2));
    if (!fs.existsSync(objectPath)) {
        (0, utils_1.ensureDir)(objectDir);
        const compressed = (0, utils_1.compress)(content);
        fs.writeFileSync(objectPath, compressed);
    }
    return hash;
}
function readObject(sha, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const objectPath = path.join(gitDir, 'objects', sha.slice(0, 2), sha.slice(2));
    if (!fs.existsSync(objectPath)) {
        throw new Error(`Object not found: ${sha}`);
    }
    const compressed = fs.readFileSync(objectPath);
    const data = (0, utils_1.decompress)(compressed);
    // Parse header: "type size\0content"
    const nullIndex = data.indexOf(0);
    const header = data.slice(0, nullIndex).toString();
    const [type, sizeStr] = header.split(' ');
    const size = parseInt(sizeStr, 10);
    const content = data.slice(nullIndex + 1);
    return {
        type: type,
        size,
        content
    };
}
function objectExists(sha, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const objectPath = path.join(gitDir, 'objects', sha.slice(0, 2), sha.slice(2));
    return fs.existsSync(objectPath);
}
function resolveShortSha(shortSha, repoRoot) {
    if (shortSha.length === 40) {
        return objectExists(shortSha, repoRoot) ? shortSha : null;
    }
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const prefix = shortSha.slice(0, 2);
    const suffix = shortSha.slice(2);
    const objectDir = path.join(gitDir, 'objects', prefix);
    if (!fs.existsSync(objectDir)) {
        return null;
    }
    const matches = [];
    for (const file of fs.readdirSync(objectDir)) {
        if (file.startsWith(suffix)) {
            matches.push(prefix + file);
        }
    }
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        throw new Error(`Ambiguous short SHA: ${shortSha}`);
    }
    return null;
}
function parseTree(content) {
    const entries = [];
    let offset = 0;
    while (offset < content.length) {
        // Find null terminator
        const nullIndex = content.indexOf(0, offset);
        if (nullIndex === -1)
            break;
        const modeAndName = content.slice(offset, nullIndex).toString();
        const spaceIndex = modeAndName.indexOf(' ');
        const mode = modeAndName.slice(0, spaceIndex).padStart(6, '0');
        const name = modeAndName.slice(spaceIndex + 1);
        // Next 20 bytes are SHA
        const shaBytes = content.slice(nullIndex + 1, nullIndex + 21);
        const sha = shaBytes.toString('hex');
        const type = mode === '040000' || mode.startsWith('40') ? 'tree' : 'blob';
        entries.push({ mode, type, sha, name });
        offset = nullIndex + 21;
    }
    return entries;
}
function parseCommit(content) {
    const text = content.toString();
    const lines = text.split('\n');
    let tree = '';
    const parents = [];
    let author = '';
    let committer = '';
    let messageStart = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
            messageStart = i + 1;
            break;
        }
        if (line.startsWith('tree ')) {
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
    const message = lines.slice(messageStart).join('\n');
    return { tree, parents, author, committer, message };
}
function parseTag(content) {
    const text = content.toString();
    const lines = text.split('\n');
    let object = '';
    let type = '';
    let tag = '';
    let tagger = '';
    let messageStart = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
            messageStart = i + 1;
            break;
        }
        if (line.startsWith('object ')) {
            object = line.slice(7);
        }
        else if (line.startsWith('type ')) {
            type = line.slice(5);
        }
        else if (line.startsWith('tag ')) {
            tag = line.slice(4);
        }
        else if (line.startsWith('tagger ')) {
            tagger = line.slice(7);
        }
    }
    const message = lines.slice(messageStart).join('\n');
    return { object, type, tag, tagger, message };
}
function writeBlob(data, repoRoot) {
    const content = createBlobContent(data);
    return writeObject(content, repoRoot);
}
function writeTree(entries, repoRoot) {
    const content = createTreeContent(entries);
    return writeObject(content, repoRoot);
}
function writeCommit(commit, repoRoot) {
    const content = createCommitContent(commit);
    return writeObject(content, repoRoot);
}
function writeTag(tag, repoRoot) {
    const content = createTagContent(tag);
    return writeObject(content, repoRoot);
}
function getObjectType(sha, repoRoot) {
    const obj = readObject(sha, repoRoot);
    return obj.type;
}
function getObjectSize(sha, repoRoot) {
    const obj = readObject(sha, repoRoot);
    return obj.size;
}
function prettyPrintObject(sha, repoRoot) {
    const obj = readObject(sha, repoRoot);
    switch (obj.type) {
        case 'blob':
            return obj.content.toString();
        case 'tree': {
            const entries = parseTree(obj.content);
            return entries.map(e => {
                const type = e.mode === '040000' || e.mode.startsWith('40') ? 'tree' : 'blob';
                return `${e.mode} ${type} ${e.sha}\t${e.name}`;
            }).join('\n');
        }
        case 'commit':
            return obj.content.toString();
        case 'tag':
            return obj.content.toString();
        default:
            return obj.content.toString();
    }
}
