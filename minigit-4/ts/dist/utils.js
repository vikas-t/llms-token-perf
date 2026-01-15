"use strict";
// Utility functions: SHA-1, zlib, path utilities
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
exports.sha1 = sha1;
exports.compress = compress;
exports.decompress = decompress;
exports.findRepoRoot = findRepoRoot;
exports.getMinigitDir = getMinigitDir;
exports.getObjectsDir = getObjectsDir;
exports.getRefsDir = getRefsDir;
exports.getHeadsDir = getHeadsDir;
exports.getTagsDir = getTagsDir;
exports.getHeadPath = getHeadPath;
exports.getIndexPath = getIndexPath;
exports.getObjectPath = getObjectPath;
exports.relativePath = relativePath;
exports.absolutePath = absolutePath;
exports.normalizePathSeparator = normalizePathSeparator;
exports.ensureDir = ensureDir;
exports.getFileMode = getFileMode;
exports.getFileModeFromStat = getFileModeFromStat;
exports.formatMode = formatMode;
exports.parseTimestamp = parseTimestamp;
exports.formatTimestamp = formatTimestamp;
exports.getAuthorInfo = getAuthorInfo;
exports.getCommitterInfo = getCommitterInfo;
exports.isBinaryFile = isBinaryFile;
exports.walkDirectory = walkDirectory;
exports.shortSha = shortSha;
exports.isValidBranchName = isValidBranchName;
const crypto = __importStar(require("crypto"));
const zlib = __importStar(require("zlib"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function sha1(data) {
    return crypto.createHash('sha1').update(data).digest('hex');
}
function compress(data) {
    return zlib.deflateSync(data);
}
function decompress(data) {
    return zlib.inflateSync(data);
}
function findRepoRoot(startPath = process.cwd()) {
    let currentPath = path.resolve(startPath);
    while (currentPath !== path.dirname(currentPath)) {
        if (fs.existsSync(path.join(currentPath, '.minigit'))) {
            return currentPath;
        }
        currentPath = path.dirname(currentPath);
    }
    // Check root
    if (fs.existsSync(path.join(currentPath, '.minigit'))) {
        return currentPath;
    }
    return null;
}
function getMinigitDir(repoRoot) {
    return path.join(repoRoot, '.minigit');
}
function getObjectsDir(repoRoot) {
    return path.join(getMinigitDir(repoRoot), 'objects');
}
function getRefsDir(repoRoot) {
    return path.join(getMinigitDir(repoRoot), 'refs');
}
function getHeadsDir(repoRoot) {
    return path.join(getRefsDir(repoRoot), 'heads');
}
function getTagsDir(repoRoot) {
    return path.join(getRefsDir(repoRoot), 'tags');
}
function getHeadPath(repoRoot) {
    return path.join(getMinigitDir(repoRoot), 'HEAD');
}
function getIndexPath(repoRoot) {
    return path.join(getMinigitDir(repoRoot), 'index');
}
function getObjectPath(repoRoot, sha) {
    return path.join(getObjectsDir(repoRoot), sha.slice(0, 2), sha.slice(2));
}
function relativePath(repoRoot, absolutePath) {
    return path.relative(repoRoot, absolutePath);
}
function absolutePath(repoRoot, relativePath) {
    return path.join(repoRoot, relativePath);
}
function normalizePathSeparator(p) {
    return p.split(path.sep).join('/');
}
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
function getFileMode(filePath) {
    const stat = fs.statSync(filePath);
    if (stat.isSymbolicLink()) {
        return 0o120000;
    }
    // Check if executable (owner execute bit)
    const isExecutable = (stat.mode & 0o100) !== 0;
    return isExecutable ? 0o100755 : 0o100644;
}
function getFileModeFromStat(stat, isLink = false) {
    if (isLink) {
        return 0o120000;
    }
    const isExecutable = (stat.mode & 0o100) !== 0;
    return isExecutable ? 0o100755 : 0o100644;
}
function formatMode(mode) {
    return mode.toString(8).padStart(6, '0');
}
function parseTimestamp(dateStr) {
    // Parse ISO format: 2024-01-01T00:00:00+00:00
    const date = new Date(dateStr);
    const timestamp = Math.floor(date.getTime() / 1000);
    // Extract timezone offset
    const match = dateStr.match(/([+-]\d{2}):?(\d{2})$/);
    if (match) {
        return { timestamp, tz: `${match[1]}${match[2]}` };
    }
    return { timestamp, tz: '+0000' };
}
function formatTimestamp(timestamp, tz) {
    const date = new Date(timestamp * 1000);
    // Format like: Mon Jan 1 00:00:00 2024 +0000
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getUTCDay()];
    const monthName = months[date.getUTCMonth()];
    const day = date.getUTCDate();
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${dayName} ${monthName} ${day} ${hours}:${minutes}:${seconds} ${year} ${tz}`;
}
function getAuthorInfo() {
    const name = process.env.GIT_AUTHOR_NAME || 'Unknown';
    const email = process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
    const dateStr = process.env.GIT_AUTHOR_DATE;
    if (dateStr) {
        const { timestamp, tz } = parseTimestamp(dateStr);
        return { name, email, timestamp, tz };
    }
    return { name, email, timestamp: Math.floor(Date.now() / 1000), tz: '+0000' };
}
function getCommitterInfo() {
    const name = process.env.GIT_COMMITTER_NAME || 'Unknown';
    const email = process.env.GIT_COMMITTER_EMAIL || 'unknown@example.com';
    const dateStr = process.env.GIT_COMMITTER_DATE;
    if (dateStr) {
        const { timestamp, tz } = parseTimestamp(dateStr);
        return { name, email, timestamp, tz };
    }
    return { name, email, timestamp: Math.floor(Date.now() / 1000), tz: '+0000' };
}
function isBinaryFile(content) {
    // Check for null bytes in the first 8000 bytes
    const checkLength = Math.min(content.length, 8000);
    for (let i = 0; i < checkLength; i++) {
        if (content[i] === 0) {
            return true;
        }
    }
    return false;
}
function walkDirectory(dir, callback, skipDirs = ['.minigit']) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (skipDirs.includes(entry.name)) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
            const stat = fs.lstatSync(fullPath);
            callback(fullPath, stat, true);
        }
        else if (entry.isDirectory()) {
            walkDirectory(fullPath, callback, skipDirs);
        }
        else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            callback(fullPath, stat, false);
        }
    }
}
function shortSha(sha) {
    return sha.slice(0, 7);
}
function isValidBranchName(name) {
    // Branch names cannot start with -, contain spaces, or be .. or have special patterns
    if (name.startsWith('-') || name.startsWith('.')) {
        return false;
    }
    if (name.includes(' ') || name.includes('..') || name.includes('~') || name.includes('^') || name.includes(':')) {
        return false;
    }
    if (name.endsWith('/') || name.endsWith('.lock')) {
        return false;
    }
    if (name.includes('@{')) {
        return false;
    }
    return name.length > 0;
}
