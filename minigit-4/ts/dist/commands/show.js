"use strict";
// show command - Show object content
Object.defineProperty(exports, "__esModule", { value: true });
exports.show = show;
const utils_1 = require("../utils");
const objects_1 = require("../objects");
const refs_1 = require("../refs");
const diff_algo_1 = require("../diff-algo");
function show(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    const ref = args[0] || 'HEAD';
    // Check for commit:path syntax
    if (ref.includes(':')) {
        const [commitRef, pathPart] = ref.split(':');
        return showFileAtCommit(repoRoot, commitRef, pathPart);
    }
    const sha = (0, refs_1.resolveRevision)(repoRoot, ref);
    if (!sha) {
        console.error(`fatal: bad object ${ref}`);
        return 1;
    }
    if (!(0, objects_1.objectExists)(repoRoot, sha)) {
        console.error(`fatal: bad object ${ref}`);
        return 1;
    }
    const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
    switch (type) {
        case 'commit':
            return showCommit(repoRoot, sha, content);
        case 'tree':
            return showTree(repoRoot, sha, content);
        case 'blob':
            return showBlob(content);
        case 'tag':
            return showTag(repoRoot, sha, content);
        default:
            console.error(`Unknown object type: ${type}`);
            return 1;
    }
}
function showCommit(repoRoot, sha, content) {
    const info = (0, objects_1.parseCommitContent)(content);
    console.log(`commit ${sha}`);
    if (info.parents.length > 1) {
        console.log(`Merge: ${info.parents.map(utils_1.shortSha).join(' ')}`);
    }
    console.log(`Author: ${info.author} <${info.authorEmail}>`);
    console.log(`Date:   ${(0, utils_1.formatTimestamp)(info.authorTimestamp, info.authorTz)}`);
    console.log('');
    // Indent message
    const messageLines = info.message.split('\n');
    for (const line of messageLines) {
        console.log(`    ${line}`);
    }
    console.log('');
    // Show diff from parent
    if (info.parents.length > 0) {
        const parentSha = info.parents[0];
        const diff = diffCommits(repoRoot, parentSha, sha);
        if (diff) {
            console.log(diff);
        }
    }
    else {
        // Initial commit - show all files as added
        const diff = diffCommits(repoRoot, null, sha);
        if (diff) {
            console.log(diff);
        }
    }
    return 0;
}
function showTree(repoRoot, sha, content) {
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const typeStr = entry.mode === '40000' ? 'tree' : 'blob';
        console.log(`${entry.mode} ${typeStr} ${entry.sha}\t${entry.name}`);
    }
    return 0;
}
function showBlob(content) {
    process.stdout.write(content);
    return 0;
}
function showTag(repoRoot, sha, content) {
    const info = (0, objects_1.parseTagContent)(content);
    console.log(`tag ${info.tag}`);
    console.log(`Tagger: ${info.tagger} <${info.taggerEmail}>`);
    console.log(`Date:   ${(0, utils_1.formatTimestamp)(info.taggerTimestamp, info.taggerTz)}`);
    console.log('');
    console.log(info.message);
    console.log('');
    // Show the tagged object
    const targetSha = (0, refs_1.resolveRevision)(repoRoot, info.object);
    if (targetSha && (0, objects_1.objectExists)(repoRoot, targetSha)) {
        const { type, content: targetContent } = (0, objects_1.readObject)(repoRoot, targetSha);
        if (type === 'commit') {
            return showCommit(repoRoot, targetSha, targetContent);
        }
    }
    return 0;
}
function showFileAtCommit(repoRoot, commitRef, filePath) {
    const sha = (0, refs_1.resolveRevision)(repoRoot, `${commitRef}:${filePath}`);
    if (!sha) {
        console.error(`fatal: path '${filePath}' does not exist in '${commitRef}'`);
        return 1;
    }
    const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
    if (type !== 'blob') {
        console.error(`fatal: '${filePath}' is not a file`);
        return 1;
    }
    process.stdout.write(content);
    return 0;
}
function diffCommits(repoRoot, parentSha, commitSha) {
    const parentFiles = new Map();
    const commitFiles = new Map();
    if (parentSha) {
        const { content } = (0, objects_1.readObject)(repoRoot, parentSha);
        const info = (0, objects_1.parseCommitContent)(content);
        collectTreeFiles(repoRoot, info.tree, '', parentFiles);
    }
    const { content } = (0, objects_1.readObject)(repoRoot, commitSha);
    const info = (0, objects_1.parseCommitContent)(content);
    collectTreeFiles(repoRoot, info.tree, '', commitFiles);
    const diffs = [];
    const allFiles = new Set([...parentFiles.keys(), ...commitFiles.keys()]);
    for (const name of [...allFiles].sort()) {
        const parentFileSha = parentFiles.get(name);
        const commitFileSha = commitFiles.get(name);
        if (parentFileSha === commitFileSha) {
            continue;
        }
        let oldContent = '';
        let newContent = '';
        if (parentFileSha) {
            const { content } = (0, objects_1.readObject)(repoRoot, parentFileSha);
            oldContent = content.toString();
        }
        if (commitFileSha) {
            const { content } = (0, objects_1.readObject)(repoRoot, commitFileSha);
            newContent = content.toString();
        }
        const diff = (0, diff_algo_1.formatUnifiedDiff)(name, name, oldContent, newContent);
        if (diff) {
            diffs.push(diff);
        }
    }
    return diffs.join('');
}
function collectTreeFiles(repoRoot, treeSha, prefix, files) {
    const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.mode === '40000') {
            collectTreeFiles(repoRoot, entry.sha, fullName, files);
        }
        else {
            files.set(fullName, entry.sha);
        }
    }
}
