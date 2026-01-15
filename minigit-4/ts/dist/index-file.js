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
exports.createIndexEntry = createIndexEntry;
exports.createIndexEntryFromFile = createIndexEntryFromFile;
const fs = __importStar(require("fs"));
const types_1 = require("./types");
const utils_1 = require("./utils");
function readIndex(repoRoot) {
    const indexPath = (0, utils_1.getIndexPath)(repoRoot);
    if (!fs.existsSync(indexPath)) {
        return [];
    }
    const data = fs.readFileSync(indexPath);
    // Verify signature
    const signature = data.slice(0, 4).toString();
    if (signature !== types_1.INDEX_SIGNATURE) {
        throw new Error('Invalid index file signature');
    }
    // Read version
    const version = data.readUInt32BE(4);
    if (version !== types_1.INDEX_VERSION) {
        throw new Error(`Unsupported index version: ${version}`);
    }
    // Read entry count
    const entryCount = data.readUInt32BE(8);
    const entries = [];
    let offset = 12;
    for (let i = 0; i < entryCount; i++) {
        const entry = readEntry(data, offset);
        entries.push(entry.entry);
        offset = entry.nextOffset;
    }
    return entries;
}
function readEntry(data, offset) {
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
    // Name length is in lower 12 bits of flags
    const nameLen = flags & 0xfff;
    // Read name (null-terminated)
    let nameEnd = offset + 62;
    while (data[nameEnd] !== 0 && nameEnd < data.length) {
        nameEnd++;
    }
    const name = data.slice(offset + 62, nameEnd).toString();
    // Entries are padded to 8-byte boundary
    // Entry size = 62 bytes fixed + name length + 1 null + padding
    const entrySize = 62 + name.length + 1;
    const paddedSize = Math.ceil(entrySize / 8) * 8;
    const nextOffset = offset + paddedSize;
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
            name,
        },
        nextOffset,
    };
}
function writeIndex(repoRoot, entries) {
    const indexPath = (0, utils_1.getIndexPath)(repoRoot);
    // Sort entries by name
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    const parts = [];
    // Header
    const header = Buffer.alloc(12);
    header.write(types_1.INDEX_SIGNATURE, 0);
    header.writeUInt32BE(types_1.INDEX_VERSION, 4);
    header.writeUInt32BE(sorted.length, 8);
    parts.push(header);
    // Entries
    for (const entry of sorted) {
        parts.push(writeEntry(entry));
    }
    // Combine all parts
    const content = Buffer.concat(parts);
    // Calculate checksum of all content
    const checksum = Buffer.from((0, utils_1.sha1)(content), 'hex');
    // Write file
    fs.writeFileSync(indexPath, Buffer.concat([content, checksum]));
}
function writeEntry(entry) {
    // Calculate name length (max 0xfff)
    const nameLen = Math.min(entry.name.length, 0xfff);
    const flags = (entry.flags & 0xf000) | nameLen;
    // Entry size = 62 bytes fixed + name length + 1 null
    const entrySize = 62 + entry.name.length + 1;
    const paddedSize = Math.ceil(entrySize / 8) * 8;
    const buf = Buffer.alloc(paddedSize);
    buf.writeUInt32BE(entry.ctimeSec, 0);
    buf.writeUInt32BE(entry.ctimeNsec, 4);
    buf.writeUInt32BE(entry.mtimeSec, 8);
    buf.writeUInt32BE(entry.mtimeNsec, 12);
    buf.writeUInt32BE(entry.dev, 16);
    buf.writeUInt32BE(entry.ino, 20);
    buf.writeUInt32BE(entry.mode, 24);
    buf.writeUInt32BE(entry.uid, 28);
    buf.writeUInt32BE(entry.gid, 32);
    buf.writeUInt32BE(entry.size, 36);
    Buffer.from(entry.sha, 'hex').copy(buf, 40);
    buf.writeUInt16BE(flags, 60);
    buf.write(entry.name, 62);
    // Remaining bytes are already 0 (padding + null terminator)
    return buf;
}
function addToIndex(entries, newEntry) {
    // Remove existing entry with same name
    const filtered = entries.filter((e) => e.name !== newEntry.name);
    filtered.push(newEntry);
    return filtered;
}
function removeFromIndex(entries, name) {
    return entries.filter((e) => e.name !== name);
}
function getIndexEntry(entries, name) {
    return entries.find((e) => e.name === name);
}
function createIndexEntry(name, sha, mode, stat) {
    return {
        ctimeSec: stat.ctimeSec,
        ctimeNsec: stat.ctimeNsec,
        mtimeSec: stat.mtimeSec,
        mtimeNsec: stat.mtimeNsec,
        dev: stat.dev,
        ino: stat.ino,
        mode,
        uid: stat.uid,
        gid: stat.gid,
        size: stat.size,
        sha,
        flags: 0,
        name,
    };
}
function createIndexEntryFromFile(name, sha, mode, fsStat) {
    return {
        ctimeSec: Math.floor(fsStat.ctimeMs / 1000),
        ctimeNsec: Math.floor((fsStat.ctimeMs % 1000) * 1000000),
        mtimeSec: Math.floor(fsStat.mtimeMs / 1000),
        mtimeNsec: Math.floor((fsStat.mtimeMs % 1000) * 1000000),
        dev: fsStat.dev,
        ino: fsStat.ino,
        mode,
        uid: fsStat.uid,
        gid: fsStat.gid,
        size: fsStat.size,
        sha,
        flags: 0,
        name,
    };
}
