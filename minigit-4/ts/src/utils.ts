// Utility functions: SHA-1, zlib, path utilities

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

export function getMinigitDir(repoRoot: string): string {
  return path.join(repoRoot, '.minigit');
}

export function getObjectsDir(repoRoot: string): string {
  return path.join(getMinigitDir(repoRoot), 'objects');
}

export function getRefsDir(repoRoot: string): string {
  return path.join(getMinigitDir(repoRoot), 'refs');
}

export function getHeadsDir(repoRoot: string): string {
  return path.join(getRefsDir(repoRoot), 'heads');
}

export function getTagsDir(repoRoot: string): string {
  return path.join(getRefsDir(repoRoot), 'tags');
}

export function getHeadPath(repoRoot: string): string {
  return path.join(getMinigitDir(repoRoot), 'HEAD');
}

export function getIndexPath(repoRoot: string): string {
  return path.join(getMinigitDir(repoRoot), 'index');
}

export function getObjectPath(repoRoot: string, sha: string): string {
  return path.join(getObjectsDir(repoRoot), sha.slice(0, 2), sha.slice(2));
}

export function relativePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath);
}

export function absolutePath(repoRoot: string, relativePath: string): string {
  return path.join(repoRoot, relativePath);
}

export function normalizePathSeparator(p: string): string {
  return p.split(path.sep).join('/');
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getFileMode(filePath: string): number {
  const stat = fs.statSync(filePath);
  if (stat.isSymbolicLink()) {
    return 0o120000;
  }
  // Check if executable (owner execute bit)
  const isExecutable = (stat.mode & 0o100) !== 0;
  return isExecutable ? 0o100755 : 0o100644;
}

export function getFileModeFromStat(stat: fs.Stats, isLink: boolean = false): number {
  if (isLink) {
    return 0o120000;
  }
  const isExecutable = (stat.mode & 0o100) !== 0;
  return isExecutable ? 0o100755 : 0o100644;
}

export function formatMode(mode: number): string {
  return mode.toString(8).padStart(6, '0');
}

export function parseTimestamp(dateStr: string): { timestamp: number; tz: string } {
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

export function formatTimestamp(timestamp: number, tz: string): string {
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

export function getAuthorInfo(): { name: string; email: string; timestamp: number; tz: string } {
  const name = process.env.GIT_AUTHOR_NAME || 'Unknown';
  const email = process.env.GIT_AUTHOR_EMAIL || 'unknown@example.com';

  const dateStr = process.env.GIT_AUTHOR_DATE;
  if (dateStr) {
    const { timestamp, tz } = parseTimestamp(dateStr);
    return { name, email, timestamp, tz };
  }

  return { name, email, timestamp: Math.floor(Date.now() / 1000), tz: '+0000' };
}

export function getCommitterInfo(): { name: string; email: string; timestamp: number; tz: string } {
  const name = process.env.GIT_COMMITTER_NAME || 'Unknown';
  const email = process.env.GIT_COMMITTER_EMAIL || 'unknown@example.com';

  const dateStr = process.env.GIT_COMMITTER_DATE;
  if (dateStr) {
    const { timestamp, tz } = parseTimestamp(dateStr);
    return { name, email, timestamp, tz };
  }

  return { name, email, timestamp: Math.floor(Date.now() / 1000), tz: '+0000' };
}

export function isBinaryFile(content: Buffer): boolean {
  // Check for null bytes in the first 8000 bytes
  const checkLength = Math.min(content.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) {
      return true;
    }
  }
  return false;
}

export function walkDirectory(
  dir: string,
  callback: (filePath: string, stat: fs.Stats, isSymlink: boolean) => void,
  skipDirs: string[] = ['.minigit']
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (skipDirs.includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const stat = fs.lstatSync(fullPath);
      callback(fullPath, stat, true);
    } else if (entry.isDirectory()) {
      walkDirectory(fullPath, callback, skipDirs);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      callback(fullPath, stat, false);
    }
  }
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function isValidBranchName(name: string): boolean {
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
