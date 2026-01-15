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
exports.getGitDir = getGitDir;
exports.ensureDir = ensureDir;
exports.relativePath = relativePath;
exports.normalizePath = normalizePath;
exports.getFileMode = getFileMode;
exports.modeToString = modeToString;
exports.parseMode = parseMode;
exports.formatTimestamp = formatTimestamp;
exports.parseTimestamp = parseTimestamp;
exports.formatAuthor = formatAuthor;
exports.parseAuthor = parseAuthor;
exports.getAuthorInfo = getAuthorInfo;
exports.getCommitterInfo = getCommitterInfo;
exports.formatDate = formatDate;
exports.isValidBranchName = isValidBranchName;
exports.shortSha = shortSha;
const crypto = __importStar(require("crypto"));
const zlib = __importStar(require("zlib"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MINIGIT_DIR = '.minigit';
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
    while (true) {
        const gitDir = path.join(currentPath, MINIGIT_DIR);
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
            return currentPath;
        }
        const parent = path.dirname(currentPath);
        if (parent === currentPath) {
            return null;
        }
        currentPath = parent;
    }
}
function getGitDir(repoRoot) {
    const root = repoRoot || findRepoRoot();
    if (!root) {
        throw new Error('Not a minigit repository (or any of the parent directories)');
    }
    return path.join(root, MINIGIT_DIR);
}
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
function relativePath(from, to) {
    return path.relative(from, to).replace(/\\/g, '/');
}
function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
function getFileMode(filePath) {
    const stats = fs.statSync(filePath);
    if (stats.isSymbolicLink()) {
        return 0o120000;
    }
    // Check if executable
    if (stats.mode & 0o111) {
        return 0o100755;
    }
    return 0o100644;
}
function modeToString(mode) {
    return mode.toString(8).padStart(6, '0');
}
function parseMode(modeStr) {
    return parseInt(modeStr, 8);
}
function formatTimestamp(date, tz = '+0000') {
    const timestamp = Math.floor(date.getTime() / 1000);
    return `${timestamp} ${tz}`;
}
function parseTimestamp(str) {
    const parts = str.split(' ');
    return {
        timestamp: parseInt(parts[0], 10),
        tz: parts[1] || '+0000'
    };
}
function formatAuthor(name, email, timestamp) {
    return `${name} <${email}> ${timestamp}`;
}
function parseAuthor(line) {
    const match = line.match(/^(.+?) <(.+?)> (.+)$/);
    if (!match) {
        throw new Error(`Invalid author line: ${line}`);
    }
    return {
        name: match[1],
        email: match[2],
        timestamp: match[3]
    };
}
function getAuthorInfo() {
    const name = process.env.GIT_AUTHOR_NAME || 'Unknown';
    const email = process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
    const dateStr = process.env.GIT_AUTHOR_DATE;
    let date;
    if (dateStr) {
        const d = new Date(dateStr);
        date = formatTimestamp(d, '+0000');
    }
    else {
        date = formatTimestamp(new Date(), '+0000');
    }
    return { name, email, date };
}
function getCommitterInfo() {
    const name = process.env.GIT_COMMITTER_NAME || process.env.GIT_AUTHOR_NAME || 'Unknown';
    const email = process.env.GIT_COMMITTER_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
    const dateStr = process.env.GIT_COMMITTER_DATE || process.env.GIT_AUTHOR_DATE;
    let date;
    if (dateStr) {
        const d = new Date(dateStr);
        date = formatTimestamp(d, '+0000');
    }
    else {
        date = formatTimestamp(new Date(), '+0000');
    }
    return { name, email, date };
}
function formatDate(timestamp, tz = '+0000') {
    const date = new Date(timestamp * 1000);
    const tzHours = parseInt(tz.slice(0, 3), 10);
    const tzMins = parseInt(tz.slice(3), 10) * (tzHours < 0 ? -1 : 1);
    // Format: Mon Jan 1 00:00:00 2024 +0000
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const utcDate = new Date(date.getTime() + (tzHours * 60 + tzMins) * 60 * 1000);
    const dayName = days[utcDate.getUTCDay()];
    const monthName = months[utcDate.getUTCMonth()];
    const day = utcDate.getUTCDate();
    const year = utcDate.getUTCFullYear();
    const hours = utcDate.getUTCHours().toString().padStart(2, '0');
    const mins = utcDate.getUTCMinutes().toString().padStart(2, '0');
    const secs = utcDate.getUTCSeconds().toString().padStart(2, '0');
    return `${dayName} ${monthName} ${day} ${hours}:${mins}:${secs} ${year} ${tz}`;
}
function isValidBranchName(name) {
    // Branch names cannot:
    // - Start with . or -
    // - Contain .. or //
    // - End with .lock
    // - Contain control characters or special characters
    if (!name)
        return false;
    if (name.startsWith('.') || name.startsWith('-'))
        return false;
    if (name.includes('..'))
        return false;
    if (name.includes('//'))
        return false;
    if (name.endsWith('.lock'))
        return false;
    if (/[\x00-\x1f\x7f~^:?*\[\]\\]/.test(name))
        return false;
    if (name.includes(' '))
        return false;
    return true;
}
function shortSha(sha) {
    return sha.slice(0, 7);
}
