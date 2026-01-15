"use strict";
// Utility functions for Mini Git
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
exports.ensureDir = ensureDir;
exports.relativePath = relativePath;
exports.normalizePath = normalizePath;
exports.formatTimestamp = formatTimestamp;
exports.parseTimestamp = parseTimestamp;
exports.formatAuthorDate = formatAuthorDate;
exports.getTimezoneOffset = getTimezoneOffset;
exports.getAuthorInfo = getAuthorInfo;
exports.getCommitterInfo = getCommitterInfo;
exports.formatDate = formatDate;
exports.isExecutable = isExecutable;
exports.isSymlink = isSymlink;
exports.getFileMode = getFileMode;
exports.modeToString = modeToString;
exports.isBinaryContent = isBinaryContent;
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
    let current = path.resolve(startPath);
    while (true) {
        const minigitPath = path.join(current, '.minigit');
        if (fs.existsSync(minigitPath) && fs.statSync(minigitPath).isDirectory()) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null; // Reached root
        }
        current = parent;
    }
}
function getMinigitDir(repoRoot) {
    const root = repoRoot || findRepoRoot();
    if (!root) {
        throw new Error('Not a minigit repository (or any of the parent directories): .minigit');
    }
    return path.join(root, '.minigit');
}
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
function relativePath(from, to) {
    return path.relative(from, to);
}
function normalizePath(p) {
    return p.split(path.sep).join('/');
}
function formatTimestamp(date, tzOffset = '+0000') {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `${timestamp} ${tzOffset}`;
}
function parseTimestamp(timestampStr) {
    const parts = timestampStr.trim().split(' ');
    const timestamp = parseInt(parts[0], 10);
    const tz = parts[1] || '+0000';
    return { date: new Date(timestamp * 1000), tz };
}
function formatAuthorDate(name, email, date, tz) {
    const d = date || new Date();
    const tzOffset = tz || getTimezoneOffset();
    const timestamp = Math.floor(d.getTime() / 1000);
    return `${name} <${email}> ${timestamp} ${tzOffset}`;
}
function getTimezoneOffset() {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const mins = (Math.abs(offset) % 60).toString().padStart(2, '0');
    return `${sign}${hours}${mins}`;
}
function getAuthorInfo() {
    const name = process.env.GIT_AUTHOR_NAME || 'Unknown';
    const email = process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
    let date = new Date();
    let tz = getTimezoneOffset();
    if (process.env.GIT_AUTHOR_DATE) {
        const parsed = parseAuthorDate(process.env.GIT_AUTHOR_DATE);
        date = parsed.date;
        tz = parsed.tz;
    }
    return { name, email, date, tz };
}
function getCommitterInfo() {
    const name = process.env.GIT_COMMITTER_NAME || process.env.GIT_AUTHOR_NAME || 'Unknown';
    const email = process.env.GIT_COMMITTER_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
    let date = new Date();
    let tz = getTimezoneOffset();
    if (process.env.GIT_COMMITTER_DATE) {
        const parsed = parseAuthorDate(process.env.GIT_COMMITTER_DATE);
        date = parsed.date;
        tz = parsed.tz;
    }
    return { name, email, date, tz };
}
function parseAuthorDate(dateStr) {
    // Handle ISO 8601 format: 2024-01-01T00:00:00+00:00
    if (dateStr.includes('T')) {
        const date = new Date(dateStr);
        // Extract timezone from ISO string
        const match = dateStr.match(/([+-]\d{2}):?(\d{2})$/);
        if (match) {
            return { date, tz: `${match[1]}${match[2]}` };
        }
        return { date, tz: '+0000' };
    }
    // Handle Unix timestamp format: 1234567890 +0000
    const parts = dateStr.trim().split(' ');
    if (parts.length >= 1 && /^\d+$/.test(parts[0])) {
        const timestamp = parseInt(parts[0], 10);
        const tz = parts[1] || '+0000';
        return { date: new Date(timestamp * 1000), tz };
    }
    // Fallback
    return { date: new Date(dateStr), tz: '+0000' };
}
function formatDate(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    const tz = getTimezoneOffset();
    return `${dayName} ${monthName} ${day} ${hours}:${mins}:${secs} ${year} ${tz}`;
}
function isExecutable(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return (stats.mode & 0o111) !== 0;
    }
    catch {
        return false;
    }
}
function isSymlink(filePath) {
    try {
        return fs.lstatSync(filePath).isSymbolicLink();
    }
    catch {
        return false;
    }
}
function getFileMode(filePath) {
    if (isSymlink(filePath)) {
        return 0o120000;
    }
    if (isExecutable(filePath)) {
        return 0o100755;
    }
    return 0o100644;
}
function modeToString(mode) {
    return mode.toString(8).padStart(6, '0');
}
function isBinaryContent(content) {
    // Check for null bytes in the first 8000 bytes (like git does)
    const checkLength = Math.min(content.length, 8000);
    for (let i = 0; i < checkLength; i++) {
        if (content[i] === 0) {
            return true;
        }
    }
    return false;
}
