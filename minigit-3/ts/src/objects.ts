// Git object handling: Blob, Tree, Commit, Tag

import * as fs from 'fs';
import * as path from 'path';
import { ObjectType, GitObject, TreeEntry, CommitObject, TagObject } from './types';
import { sha1, compress, decompress, getGitDir, ensureDir } from './utils';

export function createBlobContent(data: Buffer): Buffer {
  const header = `blob ${data.length}\0`;
  return Buffer.concat([Buffer.from(header), data]);
}

export function createTreeContent(entries: TreeEntry[]): Buffer {
  // Sort entries: directories and files sorted alphabetically
  // Git sorts with trailing / for directories
  const sorted = [...entries].sort((a, b) => {
    const aName = a.type === 'tree' ? a.name + '/' : a.name;
    const bName = b.type === 'tree' ? b.name + '/' : b.name;
    return aName.localeCompare(bName);
  });

  const parts: Buffer[] = [];
  for (const entry of sorted) {
    // Format: mode name\0sha(20 bytes)
    const mode = entry.mode.replace(/^0+/, ''); // Remove leading zeros for compatibility
    const header = `${mode} ${entry.name}\0`;
    const shaBytes = Buffer.from(entry.sha, 'hex');
    parts.push(Buffer.from(header));
    parts.push(shaBytes);
  }

  const content = Buffer.concat(parts);
  const header = `tree ${content.length}\0`;
  return Buffer.concat([Buffer.from(header), content]);
}

export function createCommitContent(commit: CommitObject): Buffer {
  let content = `tree ${commit.tree}\n`;
  for (const parent of commit.parents) {
    content += `parent ${parent}\n`;
  }
  content += `author ${commit.author}\n`;
  content += `committer ${commit.committer}\n`;
  content += `\n${commit.message}`;

  const header = `commit ${Buffer.byteLength(content)}\0`;
  return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}

export function createTagContent(tag: TagObject): Buffer {
  let content = `object ${tag.object}\n`;
  content += `type ${tag.type}\n`;
  content += `tag ${tag.tag}\n`;
  content += `tagger ${tag.tagger}\n`;
  content += `\n${tag.message}`;

  const header = `tag ${Buffer.byteLength(content)}\0`;
  return Buffer.concat([Buffer.from(header), Buffer.from(content)]);
}

export function hashObject(content: Buffer): string {
  return sha1(content);
}

export function writeObject(content: Buffer, repoRoot?: string): string {
  const hash = hashObject(content);
  const gitDir = getGitDir(repoRoot);
  const objectDir = path.join(gitDir, 'objects', hash.slice(0, 2));
  const objectPath = path.join(objectDir, hash.slice(2));

  if (!fs.existsSync(objectPath)) {
    ensureDir(objectDir);
    const compressed = compress(content);
    fs.writeFileSync(objectPath, compressed);
  }

  return hash;
}

export function readObject(sha: string, repoRoot?: string): GitObject {
  const gitDir = getGitDir(repoRoot);
  const objectPath = path.join(gitDir, 'objects', sha.slice(0, 2), sha.slice(2));

  if (!fs.existsSync(objectPath)) {
    throw new Error(`Object not found: ${sha}`);
  }

  const compressed = fs.readFileSync(objectPath);
  const data = decompress(compressed);

  // Parse header: "type size\0content"
  const nullIndex = data.indexOf(0);
  const header = data.slice(0, nullIndex).toString();
  const [type, sizeStr] = header.split(' ');
  const size = parseInt(sizeStr, 10);
  const content = data.slice(nullIndex + 1);

  return {
    type: type as ObjectType,
    size,
    content
  };
}

export function objectExists(sha: string, repoRoot?: string): boolean {
  const gitDir = getGitDir(repoRoot);
  const objectPath = path.join(gitDir, 'objects', sha.slice(0, 2), sha.slice(2));
  return fs.existsSync(objectPath);
}

export function resolveShortSha(shortSha: string, repoRoot?: string): string | null {
  if (shortSha.length === 40) {
    return objectExists(shortSha, repoRoot) ? shortSha : null;
  }

  const gitDir = getGitDir(repoRoot);
  const prefix = shortSha.slice(0, 2);
  const suffix = shortSha.slice(2);
  const objectDir = path.join(gitDir, 'objects', prefix);

  if (!fs.existsSync(objectDir)) {
    return null;
  }

  const matches: string[] = [];
  for (const file of fs.readdirSync(objectDir)) {
    if (file.startsWith(suffix)) {
      matches.push(prefix + file);
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous short SHA: ${shortSha}`);
  }
  return null;
}

export function parseTree(content: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;

  while (offset < content.length) {
    // Find null terminator
    const nullIndex = content.indexOf(0, offset);
    if (nullIndex === -1) break;

    const modeAndName = content.slice(offset, nullIndex).toString();
    const spaceIndex = modeAndName.indexOf(' ');
    const mode = modeAndName.slice(0, spaceIndex).padStart(6, '0');
    const name = modeAndName.slice(spaceIndex + 1);

    // Next 20 bytes are SHA
    const shaBytes = content.slice(nullIndex + 1, nullIndex + 21);
    const sha = shaBytes.toString('hex');

    const type: 'blob' | 'tree' = mode === '040000' || mode.startsWith('40') ? 'tree' : 'blob';

    entries.push({ mode, type, sha, name });
    offset = nullIndex + 21;
  }

  return entries;
}

export function parseCommit(content: Buffer): CommitObject {
  const text = content.toString();
  const lines = text.split('\n');

  let tree = '';
  const parents: string[] = [];
  let author = '';
  let committer = '';
  let messageStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      messageStart = i + 1;
      break;
    }

    if (line.startsWith('tree ')) {
      tree = line.slice(5);
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7));
    } else if (line.startsWith('author ')) {
      author = line.slice(7);
    } else if (line.startsWith('committer ')) {
      committer = line.slice(10);
    }
  }

  const message = lines.slice(messageStart).join('\n');

  return { tree, parents, author, committer, message };
}

export function parseTag(content: Buffer): TagObject {
  const text = content.toString();
  const lines = text.split('\n');

  let object = '';
  let type = '';
  let tag = '';
  let tagger = '';
  let messageStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      messageStart = i + 1;
      break;
    }

    if (line.startsWith('object ')) {
      object = line.slice(7);
    } else if (line.startsWith('type ')) {
      type = line.slice(5);
    } else if (line.startsWith('tag ')) {
      tag = line.slice(4);
    } else if (line.startsWith('tagger ')) {
      tagger = line.slice(7);
    }
  }

  const message = lines.slice(messageStart).join('\n');

  return { object, type, tag, tagger, message };
}

export function writeBlob(data: Buffer, repoRoot?: string): string {
  const content = createBlobContent(data);
  return writeObject(content, repoRoot);
}

export function writeTree(entries: TreeEntry[], repoRoot?: string): string {
  const content = createTreeContent(entries);
  return writeObject(content, repoRoot);
}

export function writeCommit(commit: CommitObject, repoRoot?: string): string {
  const content = createCommitContent(commit);
  return writeObject(content, repoRoot);
}

export function writeTag(tag: TagObject, repoRoot?: string): string {
  const content = createTagContent(tag);
  return writeObject(content, repoRoot);
}

export function getObjectType(sha: string, repoRoot?: string): ObjectType {
  const obj = readObject(sha, repoRoot);
  return obj.type;
}

export function getObjectSize(sha: string, repoRoot?: string): number {
  const obj = readObject(sha, repoRoot);
  return obj.size;
}

export function prettyPrintObject(sha: string, repoRoot?: string): string {
  const obj = readObject(sha, repoRoot);

  switch (obj.type) {
    case 'blob':
      return obj.content.toString();

    case 'tree': {
      const entries = parseTree(obj.content);
      return entries.map(e => {
        const type = e.mode === '040000' || e.mode.startsWith('40') ? 'tree' : 'blob';
        return `${e.mode} ${type} ${e.sha}\t${e.name}`;
      }).join('\n');
    }

    case 'commit':
      return obj.content.toString();

    case 'tag':
      return obj.content.toString();

    default:
      return obj.content.toString();
  }
}
