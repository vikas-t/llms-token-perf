// Binary index file read/write

import * as fs from 'fs';
import * as path from 'path';
import { sha1, getMinigitDir } from './utils';
import { Index, IndexEntry } from './types';

const INDEX_SIGNATURE = Buffer.from('DIRC');
const INDEX_VERSION = 2;

export function readIndex(repoRoot?: string): Index {
  const minigitDir = getMinigitDir(repoRoot);
  const indexPath = path.join(minigitDir, 'index');

  if (!fs.existsSync(indexPath)) {
    return { version: INDEX_VERSION, entries: [] };
  }

  const data = fs.readFileSync(indexPath);
  return parseIndex(data);
}

export function writeIndex(index: Index, repoRoot?: string): void {
  const minigitDir = getMinigitDir(repoRoot);
  const indexPath = path.join(minigitDir, 'index');

  const data = serializeIndex(index);
  fs.writeFileSync(indexPath, data);
}

function parseIndex(data: Buffer): Index {
  // Check signature
  const sig = data.slice(0, 4);
  if (!sig.equals(INDEX_SIGNATURE)) {
    throw new Error('Invalid index signature');
  }

  // Version (4 bytes big-endian)
  const version = data.readUInt32BE(4);
  if (version !== 2) {
    throw new Error(`Unsupported index version: ${version}`);
  }

  // Entry count (4 bytes big-endian)
  const entryCount = data.readUInt32BE(8);

  const entries: IndexEntry[] = [];
  let offset = 12;

  for (let i = 0; i < entryCount; i++) {
    const entry = parseIndexEntry(data, offset);
    entries.push(entry.entry);
    offset = entry.nextOffset;
  }

  return { version, entries };
}

function parseIndexEntry(data: Buffer, offset: number): { entry: IndexEntry; nextOffset: number } {
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

  // SHA (20 bytes)
  const sha = data.slice(offset + 40, offset + 60).toString('hex');

  // Flags (2 bytes) - includes name length in lower 12 bits
  const flags = data.readUInt16BE(offset + 60);
  const nameLen = flags & 0xfff;

  // Path (variable length, null-terminated, padded to 8-byte boundary)
  const pathStart = offset + 62;
  let pathEnd = pathStart;
  while (data[pathEnd] !== 0) {
    pathEnd++;
  }
  const filePath = data.slice(pathStart, pathEnd).toString();

  // Padding to 8-byte boundary from start of entry
  const entryLen = 62 + filePath.length + 1; // Header (62) + path + null
  const paddedLen = Math.ceil(entryLen / 8) * 8;
  const nextOffset = offset + paddedLen;

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
      path: filePath,
    },
    nextOffset,
  };
}

function serializeIndex(index: Index): Buffer {
  const parts: Buffer[] = [];

  // Header
  const header = Buffer.alloc(12);
  INDEX_SIGNATURE.copy(header, 0);
  header.writeUInt32BE(index.version, 4);
  header.writeUInt32BE(index.entries.length, 8);
  parts.push(header);

  // Sort entries by path
  const sortedEntries = index.entries.slice().sort((a, b) => a.path.localeCompare(b.path));

  // Entries
  for (const entry of sortedEntries) {
    parts.push(serializeIndexEntry(entry));
  }

  // Concatenate all parts except checksum
  const content = Buffer.concat(parts);

  // Calculate and append SHA-1 checksum
  const checksum = Buffer.from(sha1(content), 'hex');
  return Buffer.concat([content, checksum]);
}

function serializeIndexEntry(entry: IndexEntry): Buffer {
  const pathBuf = Buffer.from(entry.path);
  const nameLen = Math.min(pathBuf.length, 0xfff);

  // Calculate total entry size (62 bytes header + path + null + padding)
  const entryLen = 62 + pathBuf.length + 1;
  const paddedLen = Math.ceil(entryLen / 8) * 8;

  const buf = Buffer.alloc(paddedLen);

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

  // SHA (20 bytes)
  Buffer.from(entry.sha, 'hex').copy(buf, 40);

  // Flags (name length in lower 12 bits)
  buf.writeUInt16BE(nameLen, 60);

  // Path (null-terminated)
  pathBuf.copy(buf, 62);
  // Padding is already zeros from Buffer.alloc

  return buf;
}

export function addToIndex(
  filePath: string,
  sha: string,
  mode: number,
  stats: fs.Stats,
  repoRoot?: string
): void {
  const index = readIndex(repoRoot);

  // Remove existing entry for this path
  const existingIdx = index.entries.findIndex(e => e.path === filePath);
  if (existingIdx >= 0) {
    index.entries.splice(existingIdx, 1);
  }

  // Add new entry
  const entry: IndexEntry = {
    ctimeSec: Math.floor(stats.ctimeMs / 1000),
    ctimeNsec: Math.floor((stats.ctimeMs % 1000) * 1000000),
    mtimeSec: Math.floor(stats.mtimeMs / 1000),
    mtimeNsec: Math.floor((stats.mtimeMs % 1000) * 1000000),
    dev: stats.dev,
    ino: stats.ino,
    mode,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    sha,
    flags: Math.min(filePath.length, 0xfff),
    path: filePath,
  };

  index.entries.push(entry);
  writeIndex(index, repoRoot);
}

export function removeFromIndex(filePath: string, repoRoot?: string): boolean {
  const index = readIndex(repoRoot);
  const existingIdx = index.entries.findIndex(e => e.path === filePath);

  if (existingIdx >= 0) {
    index.entries.splice(existingIdx, 1);
    writeIndex(index, repoRoot);
    return true;
  }

  return false;
}

export function getIndexEntry(filePath: string, repoRoot?: string): IndexEntry | undefined {
  const index = readIndex(repoRoot);
  return index.entries.find(e => e.path === filePath);
}

export function getAllIndexEntries(repoRoot?: string): IndexEntry[] {
  const index = readIndex(repoRoot);
  return index.entries.slice().sort((a, b) => a.path.localeCompare(b.path));
}

export function clearIndex(repoRoot?: string): void {
  writeIndex({ version: INDEX_VERSION, entries: [] }, repoRoot);
}

// Build a tree from the current index
export function buildTreeFromIndex(repoRoot?: string): string {
  const index = readIndex(repoRoot);
  // Import here to avoid circular dependency
  const { createTree } = require('./objects');
  return buildTree(index.entries, '', repoRoot, createTree);
}

function buildTree(
  entries: IndexEntry[],
  prefix: string,
  repoRoot: string | undefined,
  createTreeFn: Function
): string {
  const { TreeEntry } = require('./types');

  // Group entries by first path component
  const direct: Map<string, IndexEntry> = new Map();
  const subdirs: Map<string, IndexEntry[]> = new Map();

  for (const entry of entries) {
    const relativePath = prefix ? entry.path.slice(prefix.length + 1) : entry.path;
    if (!relativePath) continue;

    const slashIdx = relativePath.indexOf('/');
    if (slashIdx === -1) {
      // Direct child
      direct.set(relativePath, entry);
    } else {
      // Belongs to subdirectory
      const dir = relativePath.slice(0, slashIdx);
      if (!subdirs.has(dir)) {
        subdirs.set(dir, []);
      }
      subdirs.get(dir)!.push(entry);
    }
  }

  // Build tree entries
  const treeEntries: { mode: string; name: string; sha: string }[] = [];

  // Add direct files
  for (const [name, entry] of direct) {
    const mode = (entry.mode & 0o777) === 0o755 ? '100755' :
                 (entry.mode & 0o170000) === 0o120000 ? '120000' : '100644';
    treeEntries.push({ mode, name, sha: entry.sha });
  }

  // Add subdirectories (recursively build trees)
  for (const [dir, subEntries] of subdirs) {
    const subPrefix = prefix ? `${prefix}/${dir}` : dir;
    const subTreeSha = buildTree(subEntries, subPrefix, repoRoot, createTreeFn);
    treeEntries.push({ mode: '40000', name: dir, sha: subTreeSha });
  }

  return createTreeFn(treeEntries, repoRoot);
}
