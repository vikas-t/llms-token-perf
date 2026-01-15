"use strict";
// cat-file command - Examine objects
Object.defineProperty(exports, "__esModule", { value: true });
exports.catFile = catFile;
const utils_1 = require("../utils");
const objects_1 = require("../objects");
const refs_1 = require("../refs");
function catFile(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let showType = false;
    let showSize = false;
    let prettyPrint = false;
    let objectType = null;
    let objectRef = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-t') {
            showType = true;
        }
        else if (args[i] === '-s') {
            showSize = true;
        }
        else if (args[i] === '-p') {
            prettyPrint = true;
        }
        else if (['blob', 'tree', 'commit', 'tag'].includes(args[i])) {
            objectType = args[i];
        }
        else if (!args[i].startsWith('-')) {
            objectRef = args[i];
        }
    }
    if (!objectRef) {
        console.error('fatal: object reference required');
        return 1;
    }
    // Resolve the object reference
    let sha = (0, refs_1.resolveRevision)(repoRoot, objectRef);
    if (!sha) {
        // Try as short SHA
        sha = (0, objects_1.resolveShortSha)(repoRoot, objectRef);
    }
    if (!sha || !(0, objects_1.objectExists)(repoRoot, sha)) {
        console.error(`fatal: Not a valid object name ${objectRef}`);
        return 1;
    }
    const { type, size, content } = (0, objects_1.readObject)(repoRoot, sha);
    if (showType) {
        console.log(type);
        return 0;
    }
    if (showSize) {
        console.log(size);
        return 0;
    }
    if (prettyPrint) {
        return prettyPrintObject(repoRoot, type, content);
    }
    if (objectType) {
        if (objectType !== type) {
            console.error(`fatal: expected ${objectType} but got ${type}`);
            return 1;
        }
        process.stdout.write(content);
        return 0;
    }
    // Default: show content
    process.stdout.write(content);
    return 0;
}
function prettyPrintObject(repoRoot, type, content) {
    switch (type) {
        case 'blob':
            process.stdout.write(content);
            return 0;
        case 'tree':
            return prettyPrintTree(content);
        case 'commit':
            return prettyPrintCommit(content);
        case 'tag':
            return prettyPrintTag(content);
        default:
            console.error(`Unknown object type: ${type}`);
            return 1;
    }
}
function prettyPrintTree(content) {
    const entries = (0, objects_1.parseTreeContent)(content);
    for (const entry of entries) {
        const typeStr = entry.mode === '40000' ? 'tree' : 'blob';
        // Pad mode to 6 characters
        const modeStr = entry.mode.padStart(6, '0');
        console.log(`${modeStr} ${typeStr} ${entry.sha}\t${entry.name}`);
    }
    return 0;
}
function prettyPrintCommit(content) {
    const info = (0, objects_1.parseCommitContent)(content);
    console.log(`tree ${info.tree}`);
    for (const parent of info.parents) {
        console.log(`parent ${parent}`);
    }
    console.log(`author ${info.author} <${info.authorEmail}> ${info.authorTimestamp} ${info.authorTz}`);
    console.log(`committer ${info.committer} <${info.committerEmail}> ${info.committerTimestamp} ${info.committerTz}`);
    console.log('');
    console.log(info.message);
    return 0;
}
function prettyPrintTag(content) {
    const info = (0, objects_1.parseTagContent)(content);
    console.log(`object ${info.object}`);
    console.log(`type ${info.type}`);
    console.log(`tag ${info.tag}`);
    console.log(`tagger ${info.tagger} <${info.taggerEmail}> ${info.taggerTimestamp} ${info.taggerTz}`);
    console.log('');
    console.log(info.message);
    return 0;
}
