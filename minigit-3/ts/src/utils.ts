// Utility functions for Mini Git

import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';

const MINIGIT_DIR = '.minigit';

export function sha1(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

export function compress(data: Buffer): Buffer {
  return zlib.deflateSync(data);
}

export function decompress(data: Buffer): Buffer {
  return zlib.inflateSync(data);
}

export function findRepoRoot(startPath: string = process.cwd()): string | null {
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

export function getGitDir(repoRoot?: string): string {
  const root = repoRoot || findRepoRoot();
  if (!root) {
    throw new Error('Not a minigit repository (or any of the parent directories)');
  }
  return path.join(root, MINIGIT_DIR);
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function relativePath(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function getFileMode(filePath: string): number {
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

export function modeToString(mode: number): string {
  return mode.toString(8).padStart(6, '0');
}

export function parseMode(modeStr: string): number {
  return parseInt(modeStr, 8);
}

export function formatTimestamp(date: Date, tz: string = '+0000'): string {
  const timestamp = Math.floor(date.getTime() / 1000);
  return `${timestamp} ${tz}`;
}

export function parseTimestamp(str: string): { timestamp: number; tz: string } {
  const parts = str.split(' ');
  return {
    timestamp: parseInt(parts[0], 10),
    tz: parts[1] || '+0000'
  };
}

export function formatAuthor(name: string, email: string, timestamp: string): string {
  return `${name} <${email}> ${timestamp}`;
}

export function parseAuthor(line: string): { name: string; email: string; timestamp: string } {
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

export function getAuthorInfo(): { name: string; email: string; date: string } {
  const name = process.env.GIT_AUTHOR_NAME || 'Unknown';
  const email = process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
  const dateStr = process.env.GIT_AUTHOR_DATE;

  let date: string;
  if (dateStr) {
    const d = new Date(dateStr);
    date = formatTimestamp(d, '+0000');
  } else {
    date = formatTimestamp(new Date(), '+0000');
  }

  return { name, email, date };
}

export function getCommitterInfo(): { name: string; email: string; date: string } {
  const name = process.env.GIT_COMMITTER_NAME || process.env.GIT_AUTHOR_NAME || 'Unknown';
  const email = process.env.GIT_COMMITTER_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';
  const dateStr = process.env.GIT_COMMITTER_DATE || process.env.GIT_AUTHOR_DATE;

  let date: string;
  if (dateStr) {
    const d = new Date(dateStr);
    date = formatTimestamp(d, '+0000');
  } else {
    date = formatTimestamp(new Date(), '+0000');
  }

  return { name, email, date };
}

export function formatDate(timestamp: number, tz: string = '+0000'): string {
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

export function isValidBranchName(name: string): boolean {
  // Branch names cannot:
  // - Start with . or -
  // - Contain .. or //
  // - End with .lock
  // - Contain control characters or special characters
  if (!name) return false;
  if (name.startsWith('.') || name.startsWith('-')) return false;
  if (name.includes('..')) return false;
  if (name.includes('//')) return false;
  if (name.endsWith('.lock')) return false;
  if (/[\x00-\x1f\x7f~^:?*\[\]\\]/.test(name)) return false;
  if (name.includes(' ')) return false;
  return true;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
