"use strict";
// show command - Show object content
Object.defineProperty(exports, "__esModule", { value: true });
exports.show = show;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
const diff_algo_1 = require("../diff-algo");
function show(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    const objectRef = args[0] || 'HEAD';
    // Check for path syntax: <commit>:<path>
    if (objectRef.includes(':')) {
        showObjectAtPath(objectRef, repoRoot);
        return;
    }
    const sha = (0, refs_1.resolveRef)(objectRef, repoRoot);
    if (!sha) {
        console.error(`fatal: bad object ${objectRef}`);
        process.exit(1);
    }
    const obj = (0, objects_1.readObject)(sha, repoRoot);
    switch (obj.type) {
        case 'commit':
            showCommit(sha, obj.content, repoRoot);
            break;
        case 'tree':
            showTree(sha, obj.content, repoRoot);
            break;
        case 'blob':
            console.log(obj.content.toString());
            break;
        case 'tag':
            showTag(sha, obj.content, repoRoot);
            break;
        default:
            console.log(obj.content.toString());
    }
}
function showCommit(sha, content, repoRoot) {
    const commit = (0, objects_1.parseCommit)(content);
    console.log(`commit ${sha}`);
    if (commit.parents.length > 1) {
        console.log(`Merge: ${commit.parents.map(p => (0, utils_1.shortSha)(p)).join(' ')}`);
    }
    // Parse author info
    const authorMatch = commit.author.match(/^(.+?) <(.+?)> (\d+) ([+-]\d{4})$/);
    if (authorMatch) {
        const [, name, email, timestamp, tz] = authorMatch;
        const dateStr = (0, utils_1.formatDate)(parseInt(timestamp, 10), tz);
        console.log(`Author: ${name} <${email}>`);
        console.log(`Date:   ${dateStr}`);
    }
    else {
        console.log(`Author: ${commit.author}`);
    }
    console.log('');
    for (const line of commit.message.split('\n')) {
        console.log(`    ${line}`);
    }
    console.log('');
    // Show diff from parent
    if (commit.parents.length > 0) {
        const parentSha = commit.parents[0];
        showCommitDiff(parentSha, sha, repoRoot);
    }
    else {
        // Initial commit - show all files as added
        showInitialCommitDiff(commit.tree, repoRoot);
    }
}
function showCommitDiff(parentSha, commitSha, repoRoot) {
    const parentCommit = (0, objects_1.parseCommit)((0, objects_1.readObject)(parentSha, repoRoot).content);
    const commit = (0, objects_1.parseCommit)((0, objects_1.readObject)(commitSha, repoRoot).content);
    const parentFiles = new Map();
    const commitFiles = new Map();
    collectTreeFilesWithMode(parentCommit.tree, '', repoRoot, parentFiles);
    collectTreeFilesWithMode(commit.tree, '', repoRoot, commitFiles);
    const allPaths = new Set([...parentFiles.keys(), ...commitFiles.keys()]);
    for (const name of [...allPaths].sort()) {
        const parentEntry = parentFiles.get(name);
        const commitEntry = commitFiles.get(name);
        if (!parentEntry && commitEntry) {
            // New file
            const obj = (0, objects_1.readObject)(commitEntry.sha, repoRoot);
            const diff = (0, diff_algo_1.diffFiles)('', obj.content.toString(), {
                oldPath: name,
                newPath: name,
                newMode: commitEntry.mode
            });
            diff.isNew = true;
            console.log((0, diff_algo_1.formatDiff)(diff));
        }
        else if (parentEntry && !commitEntry) {
            // Deleted file
            const obj = (0, objects_1.readObject)(parentEntry.sha, repoRoot);
            const diff = (0, diff_algo_1.diffFiles)(obj.content.toString(), '', {
                oldPath: name,
                newPath: name,
                oldMode: parentEntry.mode
            });
            diff.isDeleted = true;
            console.log((0, diff_algo_1.formatDiff)(diff));
        }
        else if (parentEntry && commitEntry && parentEntry.sha !== commitEntry.sha) {
            // Modified file
            const parentObj = (0, objects_1.readObject)(parentEntry.sha, repoRoot);
            const commitObj = (0, objects_1.readObject)(commitEntry.sha, repoRoot);
            const diff = (0, diff_algo_1.diffFiles)(parentObj.content.toString(), commitObj.content.toString(), {
                oldPath: name,
                newPath: name,
                oldMode: parentEntry.mode,
                newMode: commitEntry.mode
            });
            console.log((0, diff_algo_1.formatDiff)(diff));
        }
    }
}
function showInitialCommitDiff(treeSha, repoRoot) {
    const files = new Map();
    collectTreeFilesWithMode(treeSha, '', repoRoot, files);
    for (const [name, entry] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
        const obj = (0, objects_1.readObject)(entry.sha, repoRoot);
        const diff = (0, diff_algo_1.diffFiles)('', obj.content.toString(), {
            oldPath: name,
            newPath: name,
            newMode: entry.mode
        });
        diff.isNew = true;
        console.log((0, diff_algo_1.formatDiff)(diff));
    }
}
function showTree(sha, content, repoRoot) {
    const entries = (0, objects_1.parseTree)(content);
    for (const entry of entries) {
        const type = entry.mode.startsWith('40') ? 'tree' : 'blob';
        console.log(`${entry.mode} ${type} ${entry.sha}\t${entry.name}`);
    }
}
function showTag(sha, content, repoRoot) {
    const tag = (0, objects_1.parseTag)(content);
    console.log(`tag ${tag.tag}`);
    console.log(`Tagger: ${tag.tagger}`);
    console.log('');
    console.log(tag.message);
    console.log('');
    // Show referenced object
    const obj = (0, objects_1.readObject)(tag.object, repoRoot);
    if (obj.type === 'commit') {
        showCommit(tag.object, obj.content, repoRoot);
    }
}
function showObjectAtPath(ref, repoRoot) {
    const colonIndex = ref.indexOf(':');
    const commitRef = ref.slice(0, colonIndex);
    const pathPart = ref.slice(colonIndex + 1);
    const sha = (0, refs_1.resolveRef)(commitRef, repoRoot);
    if (!sha) {
        console.error(`fatal: bad revision '${commitRef}'`);
        process.exit(1);
    }
    const obj = (0, objects_1.readObject)(sha, repoRoot);
    if (obj.type !== 'commit') {
        console.error(`fatal: '${commitRef}' is not a commit`);
        process.exit(1);
    }
    const commit = (0, objects_1.parseCommit)(obj.content);
    const files = new Map();
    collectTreeFilesWithMode(commit.tree, '', repoRoot, files);
    const entry = files.get(pathPart);
    if (!entry) {
        console.error(`fatal: path '${pathPart}' does not exist in '${commitRef}'`);
        process.exit(1);
    }
    const blobObj = (0, objects_1.readObject)(entry.sha, repoRoot);
    console.log(blobObj.content.toString());
}
function collectTreeFilesWithMode(treeSha, prefix, repoRoot, files) {
    const treeObj = (0, objects_1.readObject)(treeSha, repoRoot);
    const entries = (0, objects_1.parseTree)(treeObj.content);
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.type === 'tree') {
            collectTreeFilesWithMode(entry.sha, name, repoRoot, files);
        }
        else {
            files.set(name, { sha: entry.sha, mode: entry.mode });
        }
    }
}
