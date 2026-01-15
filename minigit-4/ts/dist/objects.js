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
exports.parseTreeContent = parseTreeContent;
exports.parseCommitContent = parseCommitContent;
exports.parseTagContent = parseTagContent;
exports.resolveShortSha = resolveShortSha;
exports.getObjectType = getObjectType;
exports.getObjectSize = getObjectSize;
exports.createBlobFromFile = createBlobFromFile;
exports.createBlobFromSymlink = createBlobFromSymlink;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
function createBlobContent(data) {
    const header = `blob ${data.length}\0`;
    return Buffer.concat([Buffer.from(header), data]);
}
function createTreeContent(entries) {
    // Sort entries by name (Git sorts directories without trailing slash)
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    const parts = [];
    for (const entry of sorted) {
        // Format: mode<space>name<null><20-byte-sha>
        const modeName = Buffer.from(`${entry.mode} ${entry.name}\0`);
        const shaBytes = Buffer.from(entry.sha, 'hex');
        parts.push(modeName, shaBytes);
    }
    const content = Buffer.concat(parts);
    const header = `tree ${content.length}\0`;
    return Buffer.concat([Buffer.from(header), content]);
}
function createCommitContent(info) {
    const lines = [];
    lines.push(`tree ${info.tree}`);
    for (const parent of info.parents) {
        lines.push(`parent ${parent}`);
    }
    lines.push(`author ${info.author} <${info.authorEmail}> ${info.authorTimestamp} ${info.authorTz}`);
    lines.push(`committer ${info.committer} <${info.committerEmail}> ${info.committerTimestamp} ${info.committerTz}`);
    lines.push('');
    lines.push(info.message);
    const content = lines.join('\n');
    const header = `commit ${content.length}\0`;
    return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}
function createTagContent(info) {
    const lines = [];
    lines.push(`object ${info.object}`);
    lines.push(`type ${info.type}`);
    lines.push(`tag ${info.tag}`);
    lines.push(`tagger ${info.tagger} <${info.taggerEmail}> ${info.taggerTimestamp} ${info.taggerTz}`);
    lines.push('');
    lines.push(info.message);
    const content = lines.join('\n');
    const header = `tag ${content.length}\0`;
    return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}
function hashObject(content) {
    return (0, utils_1.sha1)(content);
}
function writeObject(repoRoot, content) {
    const sha = hashObject(content);
    const objectPath = (0, utils_1.getObjectPath)(repoRoot, sha);
    if (!fs.existsSync(objectPath)) {
        (0, utils_1.ensureDir)(path.dirname(objectPath));
        fs.writeFileSync(objectPath, (0, utils_1.compress)(content));
    }
    return sha;
}
function readObject(repoRoot, sha) {
    const objectPath = (0, utils_1.getObjectPath)(repoRoot, sha);
    if (!fs.existsSync(objectPath)) {
        throw new Error(`Object ${sha} not found`);
    }
    const compressed = fs.readFileSync(objectPath);
    const data = (0, utils_1.decompress)(compressed);
    // Parse header
    const nullIndex = data.indexOf(0);
    const header = data.slice(0, nullIndex).toString();
    const [type, sizeStr] = header.split(' ');
    const size = parseInt(sizeStr, 10);
    const content = data.slice(nullIndex + 1);
    return { type: type, size, content };
}
function objectExists(repoRoot, sha) {
    return fs.existsSync((0, utils_1.getObjectPath)(repoRoot, sha));
}
function parseTreeContent(content) {
    const entries = [];
    let offset = 0;
    while (offset < content.length) {
        // Find the null byte separating mode/name from SHA
        const nullIndex = content.indexOf(0, offset);
        if (nullIndex === -1)
            break;
        const modeAndName = content.slice(offset, nullIndex).toString();
        const spaceIndex = modeAndName.indexOf(' ');
        const mode = modeAndName.slice(0, spaceIndex);
        const name = modeAndName.slice(spaceIndex + 1);
        // Read 20-byte SHA
        const shaBytes = content.slice(nullIndex + 1, nullIndex + 21);
        const sha = shaBytes.toString('hex');
        entries.push({ mode, name, sha });
        offset = nullIndex + 21;
    }
    return entries;
}
function parseCommitContent(content) {
    const text = content.toString();
    const lines = text.split('\n');
    let tree = '';
    const parents = [];
    let author = '';
    let authorEmail = '';
    let authorTimestamp = 0;
    let authorTz = '+0000';
    let committer = '';
    let committerEmail = '';
    let committerTimestamp = 0;
    let committerTz = '+0000';
    let message = '';
    let inMessage = false;
    const messageLines = [];
    for (const line of lines) {
        if (inMessage) {
            messageLines.push(line);
            continue;
        }
        if (line === '') {
            inMessage = true;
            continue;
        }
        if (line.startsWith('tree ')) {
            tree = line.slice(5);
        }
        else if (line.startsWith('parent ')) {
            parents.push(line.slice(7));
        }
        else if (line.startsWith('author ')) {
            const authorInfo = parsePersonLine(line.slice(7));
            author = authorInfo.name;
            authorEmail = authorInfo.email;
            authorTimestamp = authorInfo.timestamp;
            authorTz = authorInfo.tz;
        }
        else if (line.startsWith('committer ')) {
            const committerInfo = parsePersonLine(line.slice(10));
            committer = committerInfo.name;
            committerEmail = committerInfo.email;
            committerTimestamp = committerInfo.timestamp;
            committerTz = committerInfo.tz;
        }
    }
    message = messageLines.join('\n');
    return {
        tree,
        parents,
        author,
        authorEmail,
        authorTimestamp,
        authorTz,
        committer,
        committerEmail,
        committerTimestamp,
        committerTz,
        message,
    };
}
function parseTagContent(content) {
    const text = content.toString();
    const lines = text.split('\n');
    let object = '';
    let type = '';
    let tag = '';
    let tagger = '';
    let taggerEmail = '';
    let taggerTimestamp = 0;
    let taggerTz = '+0000';
    let message = '';
    let inMessage = false;
    const messageLines = [];
    for (const line of lines) {
        if (inMessage) {
            messageLines.push(line);
            continue;
        }
        if (line === '') {
            inMessage = true;
            continue;
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
            const taggerInfo = parsePersonLine(line.slice(7));
            tagger = taggerInfo.name;
            taggerEmail = taggerInfo.email;
            taggerTimestamp = taggerInfo.timestamp;
            taggerTz = taggerInfo.tz;
        }
    }
    message = messageLines.join('\n');
    return {
        object,
        type,
        tag,
        tagger,
        taggerEmail,
        taggerTimestamp,
        taggerTz,
        message,
    };
}
function parsePersonLine(line) {
    // Format: Name <email> timestamp tz
    const emailStart = line.indexOf('<');
    const emailEnd = line.indexOf('>');
    const name = line.slice(0, emailStart).trim();
    const email = line.slice(emailStart + 1, emailEnd);
    const rest = line.slice(emailEnd + 1).trim().split(' ');
    const timestamp = parseInt(rest[0], 10);
    const tz = rest[1] || '+0000';
    return { name, email, timestamp, tz };
}
function resolveShortSha(repoRoot, shortSha) {
    if (shortSha.length < 4) {
        return null;
    }
    if (shortSha.length === 40) {
        return objectExists(repoRoot, shortSha) ? shortSha : null;
    }
    const prefix = shortSha.slice(0, 2);
    const rest = shortSha.slice(2);
    const objectsDir = (0, utils_1.getObjectsDir)(repoRoot);
    const prefixDir = path.join(objectsDir, prefix);
    if (!fs.existsSync(prefixDir)) {
        return null;
    }
    const matches = [];
    const files = fs.readdirSync(prefixDir);
    for (const file of files) {
        if (file.startsWith(rest)) {
            matches.push(prefix + file);
        }
    }
    if (matches.length === 1) {
        return matches[0];
    }
    return null;
}
function getObjectType(repoRoot, sha) {
    const { type } = readObject(repoRoot, sha);
    return type;
}
function getObjectSize(repoRoot, sha) {
    const { size } = readObject(repoRoot, sha);
    return size;
}
function createBlobFromFile(repoRoot, filePath) {
    const content = fs.readFileSync(filePath);
    const blobContent = createBlobContent(content);
    return writeObject(repoRoot, blobContent);
}
function createBlobFromSymlink(repoRoot, linkPath) {
    const target = fs.readlinkSync(linkPath);
    const blobContent = createBlobContent(Buffer.from(target));
    return writeObject(repoRoot, blobContent);
}
