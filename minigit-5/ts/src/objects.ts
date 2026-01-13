// Git object storage: Blob, Tree, Commit, Tag handling

import * as fs from 'fs';
import * as path from 'path';
import { sha1, compress, decompress, getMinigitDir, ensureDir, modeToString } from './utils';
import { BlobObject, TreeObject, CommitObject, TagObject, GitObject, TreeEntry } from './types';

export function hashObject(type: string, content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  return sha1(store);
}

export function writeObject(type: string, content: Buffer, repoRoot?: string): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  const objectSha = sha1(store);

  const minigitDir = getMinigitDir(repoRoot);
  const objectDir = path.join(minigitDir, 'objects', objectSha.slice(0, 2));
  ensureDir(objectDir);

  const objectPath = path.join(objectDir, objectSha.slice(2));
  if (!fs.existsSync(objectPath)) {
    const compressed = compress(store);
    fs.writeFileSync(objectPath, compressed);
  }

  return objectSha;
}

export function readObject(sha: string, repoRoot?: string): { type: string; content: Buffer } {
  const minigitDir = getMinigitDir(repoRoot);
  const objectPath = path.join(minigitDir, 'objects', sha.slice(0, 2), sha.slice(2));

  if (!fs.existsSync(objectPath)) {
    throw new Error(`Object not found: ${sha}`);
  }

  const compressed = fs.readFileSync(objectPath);
  const raw = decompress(compressed);

  // Parse header: "type size\0content"
  const nullIndex = raw.indexOf(0);
  if (nullIndex === -1) {
    throw new Error(`Invalid object: ${sha}`);
  }

  const header = raw.slice(0, nullIndex).toString();
  const [type] = header.split(' ');
  const content = raw.slice(nullIndex + 1);

  return { type, content };
}

export function objectExists(sha: string, repoRoot?: string): boolean {
  try {
    const minigitDir = getMinigitDir(repoRoot);
    const objectPath = path.join(minigitDir, 'objects', sha.slice(0, 2), sha.slice(2));
    return fs.existsSync(objectPath);
  } catch {
    return false;
  }
}

export function expandShortSha(shortSha: string, repoRoot?: string): string {
  if (shortSha.length === 40) {
    return shortSha;
  }

  const minigitDir = getMinigitDir(repoRoot);
  const objectsDir = path.join(minigitDir, 'objects');

  if (shortSha.length < 4) {
    throw new Error(`SHA too short: ${shortSha}`);
  }

  const prefix = shortSha.slice(0, 2);
  const rest = shortSha.slice(2);
  const searchDir = path.join(objectsDir, prefix);

  if (!fs.existsSync(searchDir)) {
    throw new Error(`Object not found: ${shortSha}`);
  }

  const matches = fs.readdirSync(searchDir).filter(name => name.startsWith(rest));

  if (matches.length === 0) {
    throw new Error(`Object not found: ${shortSha}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous SHA: ${shortSha}`);
  }

  return prefix + matches[0];
}

export function createBlob(content: Buffer, write: boolean = false, repoRoot?: string): string {
  if (write) {
    return writeObject('blob', content, repoRoot);
  }
  return hashObject('blob', content);
}

export function parseTree(content: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;

  while (offset < content.length) {
    // Find space after mode
    const spaceIndex = content.indexOf(0x20, offset);
    if (spaceIndex === -1) break;

    const mode = content.slice(offset, spaceIndex).toString();

    // Find null after name
    const nullIndex = content.indexOf(0, spaceIndex + 1);
    if (nullIndex === -1) break;

    const name = content.slice(spaceIndex + 1, nullIndex).toString();

    // Next 20 bytes are SHA (binary)
    const shaBytes = content.slice(nullIndex + 1, nullIndex + 21);
    const sha = shaBytes.toString('hex');

    entries.push({ mode, name, sha });
    offset = nullIndex + 21;
  }

  return entries;
}

export function serializeTree(entries: TreeEntry[]): Buffer {
  // Sort entries: directories (trees) come after files with same prefix
  const sorted = entries.slice().sort((a, b) => {
    // For sorting, append / to directory names (mode 40000)
    const aName = a.mode === '40000' ? a.name + '/' : a.name;
    const bName = b.mode === '40000' ? b.name + '/' : b.name;
    return aName.localeCompare(bName);
  });

  const parts: Buffer[] = [];
  for (const entry of sorted) {
    // Mode (no leading zeros for directories: 40000 not 040000)
    const mode = entry.mode === '40000' ? '40000' : entry.mode;
    const header = Buffer.from(`${mode} ${entry.name}\0`);
    const sha = Buffer.from(entry.sha, 'hex');
    parts.push(header, sha);
  }

  return Buffer.concat(parts);
}

export function createTree(entries: TreeEntry[], repoRoot?: string): string {
  const content = serializeTree(entries);
  return writeObject('tree', content, repoRoot);
}

export function parseCommit(content: Buffer): CommitObject {
  const lines = content.toString().split('\n');
  let tree = '';
  const parents: string[] = [];
  let author = '';
  let committer = '';
  let message = '';
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inMessage) {
      message += (message ? '\n' : '') + line;
    } else if (line === '') {
      inMessage = true;
    } else if (line.startsWith('tree ')) {
      tree = line.slice(5);
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7));
    } else if (line.startsWith('author ')) {
      author = line.slice(7);
    } else if (line.startsWith('committer ')) {
      committer = line.slice(10);
    }
  }

  return { type: 'commit', tree, parents, author, committer, message };
}

export function serializeCommit(commit: Omit<CommitObject, 'type'>): Buffer {
  let content = `tree ${commit.tree}\n`;
  for (const parent of commit.parents) {
    content += `parent ${parent}\n`;
  }
  content += `author ${commit.author}\n`;
  content += `committer ${commit.committer}\n`;
  content += `\n${commit.message}`;

  return Buffer.from(content);
}

export function createCommit(
  tree: string,
  parents: string[],
  author: string,
  committer: string,
  message: string,
  repoRoot?: string
): string {
  const content = serializeCommit({ tree, parents, author, committer, message });
  return writeObject('commit', content, repoRoot);
}

export function parseTag(content: Buffer): TagObject {
  const lines = content.toString().split('\n');
  let object = '';
  let objectType = '';
  let tagName = '';
  let tagger = '';
  let message = '';
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inMessage) {
      message += (message ? '\n' : '') + line;
    } else if (line === '') {
      inMessage = true;
    } else if (line.startsWith('object ')) {
      object = line.slice(7);
    } else if (line.startsWith('type ')) {
      objectType = line.slice(5);
    } else if (line.startsWith('tag ')) {
      tagName = line.slice(4);
    } else if (line.startsWith('tagger ')) {
      tagger = line.slice(7);
    }
  }

  return { type: 'tag', object, objectType, tagName, tagger, message };
}

export function serializeTag(tag: Omit<TagObject, 'type'>): Buffer {
  let content = `object ${tag.object}\n`;
  content += `type ${tag.objectType}\n`;
  content += `tag ${tag.tagName}\n`;
  content += `tagger ${tag.tagger}\n`;
  content += `\n${tag.message}`;

  return Buffer.from(content);
}

export function createTag(
  object: string,
  objectType: string,
  tagName: string,
  tagger: string,
  message: string,
  repoRoot?: string
): string {
  const content = serializeTag({ object, objectType, tagName, tagger, message });
  return writeObject('tag', content, repoRoot);
}

export function getObjectType(sha: string, repoRoot?: string): string {
  const { type } = readObject(sha, repoRoot);
  return type;
}

export function getObjectSize(sha: string, repoRoot?: string): number {
  const { content } = readObject(sha, repoRoot);
  return content.length;
}

export function getBlob(sha: string, repoRoot?: string): Buffer {
  const { type, content } = readObject(sha, repoRoot);
  if (type !== 'blob') {
    throw new Error(`Expected blob, got ${type}`);
  }
  return content;
}

export function getTree(sha: string, repoRoot?: string): TreeEntry[] {
  const { type, content } = readObject(sha, repoRoot);
  if (type !== 'tree') {
    throw new Error(`Expected tree, got ${type}`);
  }
  return parseTree(content);
}

export function getCommit(sha: string, repoRoot?: string): CommitObject {
  const { type, content } = readObject(sha, repoRoot);
  if (type !== 'commit') {
    throw new Error(`Expected commit, got ${type}`);
  }
  return parseCommit(content);
}

export function getTagObject(sha: string, repoRoot?: string): TagObject {
  const { type, content } = readObject(sha, repoRoot);
  if (type !== 'tag') {
    throw new Error(`Expected tag, got ${type}`);
  }
  return parseTag(content);
}

// Get tree SHA from a tree-ish (commit, tag, or tree)
export function getTreeFromTreeIsh(sha: string, repoRoot?: string): string {
  const { type, content } = readObject(sha, repoRoot);

  if (type === 'tree') {
    return sha;
  }

  if (type === 'commit') {
    const commit = parseCommit(content);
    return commit.tree;
  }

  if (type === 'tag') {
    const tag = parseTag(content);
    return getTreeFromTreeIsh(tag.object, repoRoot);
  }

  throw new Error(`Cannot get tree from ${type}`);
}

// Walk a tree recursively and return all blob paths with their SHAs
export function walkTree(
  treeSha: string,
  prefix: string = '',
  repoRoot?: string
): Map<string, { sha: string; mode: string }> {
  const result = new Map<string, { sha: string; mode: string }>();
  const entries = getTree(treeSha, repoRoot);

  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      // Directory - recurse
      const subMap = walkTree(entry.sha, fullPath, repoRoot);
      subMap.forEach((value, key) => result.set(key, value));
    } else {
      result.set(fullPath, { sha: entry.sha, mode: entry.mode });
    }
  }

  return result;
}
