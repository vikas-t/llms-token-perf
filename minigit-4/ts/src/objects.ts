// Git object handling: Blob, Tree, Commit, Tag

import * as fs from 'fs';
import * as path from 'path';
import { ObjectType, TreeEntry, CommitInfo, TagInfo } from './types';
import { sha1, compress, decompress, getObjectPath, ensureDir, getObjectsDir } from './utils';

export function createBlobContent(data: Buffer): Buffer {
  const header = `blob ${data.length}\0`;
  return Buffer.concat([Buffer.from(header), data]);
}

export function createTreeContent(entries: TreeEntry[]): Buffer {
  // Sort entries by name (Git sorts directories without trailing slash)
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  const parts: Buffer[] = [];
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

export function createCommitContent(info: CommitInfo): Buffer {
  const lines: string[] = [];
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

export function createTagContent(info: TagInfo): Buffer {
  const lines: string[] = [];
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

export function hashObject(content: Buffer): string {
  return sha1(content);
}

export function writeObject(repoRoot: string, content: Buffer): string {
  const sha = hashObject(content);
  const objectPath = getObjectPath(repoRoot, sha);

  if (!fs.existsSync(objectPath)) {
    ensureDir(path.dirname(objectPath));
    fs.writeFileSync(objectPath, compress(content));
  }

  return sha;
}

export function readObject(repoRoot: string, sha: string): { type: ObjectType; size: number; content: Buffer } {
  const objectPath = getObjectPath(repoRoot, sha);

  if (!fs.existsSync(objectPath)) {
    throw new Error(`Object ${sha} not found`);
  }

  const compressed = fs.readFileSync(objectPath);
  const data = decompress(compressed);

  // Parse header
  const nullIndex = data.indexOf(0);
  const header = data.slice(0, nullIndex).toString();
  const [type, sizeStr] = header.split(' ');
  const size = parseInt(sizeStr, 10);
  const content = data.slice(nullIndex + 1);

  return { type: type as ObjectType, size, content };
}

export function objectExists(repoRoot: string, sha: string): boolean {
  return fs.existsSync(getObjectPath(repoRoot, sha));
}

export function parseTreeContent(content: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;

  while (offset < content.length) {
    // Find the null byte separating mode/name from SHA
    const nullIndex = content.indexOf(0, offset);
    if (nullIndex === -1) break;

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

export function parseCommitContent(content: Buffer): CommitInfo {
  const text = content.toString();
  const lines = text.split('\n');

  let tree = '';
  const parents: string[] = [];
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
  const messageLines: string[] = [];

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
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7));
    } else if (line.startsWith('author ')) {
      const authorInfo = parsePersonLine(line.slice(7));
      author = authorInfo.name;
      authorEmail = authorInfo.email;
      authorTimestamp = authorInfo.timestamp;
      authorTz = authorInfo.tz;
    } else if (line.startsWith('committer ')) {
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

export function parseTagContent(content: Buffer): TagInfo {
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
  const messageLines: string[] = [];

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
    } else if (line.startsWith('type ')) {
      type = line.slice(5);
    } else if (line.startsWith('tag ')) {
      tag = line.slice(4);
    } else if (line.startsWith('tagger ')) {
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

function parsePersonLine(line: string): { name: string; email: string; timestamp: number; tz: string } {
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

export function resolveShortSha(repoRoot: string, shortSha: string): string | null {
  if (shortSha.length < 4) {
    return null;
  }

  if (shortSha.length === 40) {
    return objectExists(repoRoot, shortSha) ? shortSha : null;
  }

  const prefix = shortSha.slice(0, 2);
  const rest = shortSha.slice(2);
  const objectsDir = getObjectsDir(repoRoot);
  const prefixDir = path.join(objectsDir, prefix);

  if (!fs.existsSync(prefixDir)) {
    return null;
  }

  const matches: string[] = [];
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

export function getObjectType(repoRoot: string, sha: string): ObjectType {
  const { type } = readObject(repoRoot, sha);
  return type;
}

export function getObjectSize(repoRoot: string, sha: string): number {
  const { size } = readObject(repoRoot, sha);
  return size;
}

export function createBlobFromFile(repoRoot: string, filePath: string): string {
  const content = fs.readFileSync(filePath);
  const blobContent = createBlobContent(content);
  return writeObject(repoRoot, blobContent);
}

export function createBlobFromSymlink(repoRoot: string, linkPath: string): string {
  const target = fs.readlinkSync(linkPath);
  const blobContent = createBlobContent(Buffer.from(target));
  return writeObject(repoRoot, blobContent);
}
