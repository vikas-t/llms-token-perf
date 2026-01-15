"use strict";
// Binary index file read/write
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
exports.readIndex = readIndex;
exports.writeIndex = writeIndex;
exports.addToIndex = addToIndex;
exports.removeFromIndex = removeFromIndex;
exports.getIndexEntry = getIndexEntry;
exports.clearIndex = clearIndex;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
const INDEX_SIGNATURE = 'DIRC';
const INDEX_VERSION = 2;
function readIndex(repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const indexPath = path.join(gitDir, 'index');
    if (!fs.existsSync(indexPath)) {
        return [];
    }
    const data = fs.readFileSync(indexPath);
    // Verify signature
    const signature = data.slice(0, 4).toString();
    if (signature !== INDEX_SIGNATURE) {
        throw new Error('Invalid index file signature');
    }
    // Read version
    const version = data.readUInt32BE(4);
    if (version !== INDEX_VERSION) {
        throw new Error(`Unsupported index version: ${version}`);
    }
    // Read entry count
    const entryCount = data.readUInt32BE(8);
    const entries = [];
    let offset = 12;
    for (let i = 0; i < entryCount; i++) {
        const entry = readIndexEntry(data, offset);
        entries.push(entry.entry);
        offset = entry.nextOffset;
    }
    return entries;
}
function readIndexEntry(data, offset) {
    const ctimeSec = data.readUInt32BE(offset);
    const ctimeNsec = data.readUInt32BE(offset + 4);
    const mtimeSec = data.readUInt32BE(offset + 8);
    const mtimeNsec = data.readUInt32BE(offset + 12);
    const dev = data.readUInt32BE(offset + 16);
    const ino = data.readUInt32BE(offset + 20);
    const mode = data.readUInt32BE(offset + 24);
    const uid = data.readUInt32BE(offset + 28);
    const gid = data.readUInt32BE(offset + 32);
    const size = data.readUInt32BE(offset + 36);
    const sha = data.slice(offset + 40, offset + 60).toString('hex');
    const flags = data.readUInt16BE(offset + 60);
    // Name length is lower 12 bits of flags
    const nameLength = flags & 0xfff;
    // Read name (null-terminated, then padded to 8-byte boundary)
    const nameStart = offset + 62;
    let nameEnd = nameStart;
    // Find null terminator
    while (data[nameEnd] !== 0) {
        nameEnd++;
    }
    const name = data.slice(nameStart, nameEnd).toString();
    // Calculate padding to 8-byte boundary
    // Entry size is: 62 + name length + 1 (null) + padding
    const entrySize = 62 + name.length + 1;
    const padding = (8 - (entrySize % 8)) % 8;
    const nextOffset = nameStart + name.length + 1 + padding;
    return {
        entry: {
            ctimeSec,
            ctimeNsec,
            mtimeSec,
            mtimeNsec,
            dev,
            ino,
            mode,
            uid,
            gid,
            size,
            sha,
            flags,
            name
        },
        nextOffset
    };
}
function writeIndex(entries, repoRoot) {
    const gitDir = (0, utils_1.getGitDir)(repoRoot);
    const indexPath = path.join(gitDir, 'index');
    // Sort entries by name
    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    // Build index content
    const parts = [];
    // Header
    const header = Buffer.alloc(12);
    header.write(INDEX_SIGNATURE, 0);
    header.writeUInt32BE(INDEX_VERSION, 4);
    header.writeUInt32BE(sortedEntries.length, 8);
    parts.push(header);
    // Entries
    for (const entry of sortedEntries) {
        parts.push(writeIndexEntry(entry));
    }
    // Combine all parts
    const content = Buffer.concat(parts);
    // Calculate checksum
    const checksum = Buffer.from((0, utils_1.sha1)(content), 'hex');
    // Write to file
    fs.writeFileSync(indexPath, Buffer.concat([content, checksum]));
}
function writeIndexEntry(entry) {
    const nameBuffer = Buffer.from(entry.name);
    const nameLength = Math.min(nameBuffer.length, 0xfff);
    // Calculate total entry size with padding
    const baseSize = 62 + nameBuffer.length + 1;
    const padding = (8 - (baseSize % 8)) % 8;
    const totalSize = baseSize + padding;
    const buffer = Buffer.alloc(totalSize);
    buffer.writeUInt32BE(entry.ctimeSec, 0);
    buffer.writeUInt32BE(entry.ctimeNsec, 4);
    buffer.writeUInt32BE(entry.mtimeSec, 8);
    buffer.writeUInt32BE(entry.mtimeNsec, 12);
    buffer.writeUInt32BE(entry.dev, 16);
    buffer.writeUInt32BE(entry.ino, 20);
    buffer.writeUInt32BE(entry.mode, 24);
    buffer.writeUInt32BE(entry.uid, 28);
    buffer.writeUInt32BE(entry.gid, 32);
    buffer.writeUInt32BE(entry.size, 36);
    Buffer.from(entry.sha, 'hex').copy(buffer, 40);
    buffer.writeUInt16BE(nameLength, 60);
    nameBuffer.copy(buffer, 62);
    // Null terminator and padding are already 0 from alloc
    return buffer;
}
function addToIndex(entry, repoRoot) {
    const entries = readIndex(repoRoot);
    // Remove existing entry with same name
    const filtered = entries.filter(e => e.name !== entry.name);
    // Add new entry
    filtered.push(entry);
    writeIndex(filtered, repoRoot);
}
function removeFromIndex(name, repoRoot) {
    const entries = readIndex(repoRoot);
    const filtered = entries.filter(e => e.name !== name && !e.name.startsWith(name + '/'));
    writeIndex(filtered, repoRoot);
}
function getIndexEntry(name, repoRoot) {
    const entries = readIndex(repoRoot);
    return entries.find(e => e.name === name);
}
function clearIndex(repoRoot) {
    writeIndex([], repoRoot);
}
