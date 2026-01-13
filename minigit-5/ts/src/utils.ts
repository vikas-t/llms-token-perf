// Utility functions for Mini Git

import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';

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

export function getMinigitDir(repoRoot?: string): string {
  const root = repoRoot || findRepoRoot();
  if (!root) {
    throw new Error('Not a minigit repository (or any of the parent directories): .minigit');
  }
  return path.join(root, '.minigit');
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

export function normalizePath(p: string): string {
  return p.split(path.sep).join('/');
}

export function formatTimestamp(date: Date, tzOffset: string = '+0000'): string {
  const timestamp = Math.floor(date.getTime() / 1000);
  return `${timestamp} ${tzOffset}`;
}

export function parseTimestamp(timestampStr: string): { date: Date; tz: string } {
  const parts = timestampStr.trim().split(' ');
  const timestamp = parseInt(parts[0], 10);
  const tz = parts[1] || '+0000';
  return { date: new Date(timestamp * 1000), tz };
}

export function formatAuthorDate(name: string, email: string, date?: Date, tz?: string): string {
  const d = date || new Date();
  const tzOffset = tz || getTimezoneOffset();
  const timestamp = Math.floor(d.getTime() / 1000);
  return `${name} <${email}> ${timestamp} ${tzOffset}`;
}

export function getTimezoneOffset(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const mins = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${mins}`;
}

export function getAuthorInfo(): { name: string; email: string; date: Date; tz: string } {
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

export function getCommitterInfo(): { name: string; email: string; date: Date; tz: string } {
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

function parseAuthorDate(dateStr: string): { date: Date; tz: string } {
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

export function formatDate(date: Date): string {
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

export function isExecutable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

export function getFileMode(filePath: string): number {
  if (isSymlink(filePath)) {
    return 0o120000;
  }
  if (isExecutable(filePath)) {
    return 0o100755;
  }
  return 0o100644;
}

export function modeToString(mode: number): string {
  return mode.toString(8).padStart(6, '0');
}

export function isBinaryContent(content: Buffer): boolean {
  // Check for null bytes in the first 8000 bytes (like git does)
  const checkLength = Math.min(content.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}
