"use strict";
// log command - Show commit history
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
const utils_1 = require("../utils");
const objects_1 = require("../objects");
const refs_1 = require("../refs");
function log(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    let oneline = false;
    let showAll = false;
    let graph = false;
    let showStat = false;
    let limit = null;
    let startRef = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--oneline') {
            oneline = true;
        }
        else if (args[i] === '--all') {
            showAll = true;
        }
        else if (args[i] === '--graph') {
            graph = true;
        }
        else if (args[i] === '--stat') {
            showStat = true;
        }
        else if (args[i] === '-n' && i + 1 < args.length) {
            limit = parseInt(args[++i], 10);
        }
        else if (!args[i].startsWith('-')) {
            startRef = args[i];
        }
    }
    // Get starting commits
    let startShas = [];
    if (showAll) {
        // Get all branch heads
        const branches = (0, refs_1.getBranches)(repoRoot);
        for (const branch of branches) {
            const sha = (0, refs_1.resolveRef)(repoRoot, branch);
            if (sha)
                startShas.push(sha);
        }
        // Also include HEAD if detached
        const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
        if (headCommit && !startShas.includes(headCommit)) {
            startShas.push(headCommit);
        }
    }
    else if (startRef) {
        const sha = (0, refs_1.resolveRevision)(repoRoot, startRef);
        if (!sha) {
            console.error(`fatal: bad revision '${startRef}'`);
            return 1;
        }
        startShas = [sha];
    }
    else {
        const headCommit = (0, refs_1.getHeadCommit)(repoRoot);
        if (!headCommit) {
            console.error('fatal: your current branch does not have any commits yet');
            return 1;
        }
        startShas = [headCommit];
    }
    // Collect commits using BFS (to handle merge commits properly)
    const commits = [];
    const visited = new Set();
    const queue = [...startShas];
    while (queue.length > 0 && (limit === null || commits.length < limit)) {
        // Sort queue by timestamp to show in order
        queue.sort((a, b) => {
            const infoA = getCommitInfo(repoRoot, a);
            const infoB = getCommitInfo(repoRoot, b);
            if (!infoA || !infoB)
                return 0;
            return infoB.committerTimestamp - infoA.committerTimestamp;
        });
        const sha = queue.shift();
        if (visited.has(sha))
            continue;
        visited.add(sha);
        if (!(0, objects_1.objectExists)(repoRoot, sha))
            continue;
        const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
        if (type !== 'commit')
            continue;
        const info = (0, objects_1.parseCommitContent)(content);
        commits.push({ sha, info });
        // Add parents to queue
        for (const parent of info.parents) {
            if (!visited.has(parent)) {
                queue.push(parent);
            }
        }
    }
    // Print commits
    for (const { sha, info } of commits) {
        if (oneline) {
            const prefix = graph ? '* ' : '';
            console.log(`${prefix}${(0, utils_1.shortSha)(sha)} ${info.message.split('\n')[0]}`);
        }
        else {
            if (graph) {
                console.log('*');
            }
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
            if (showStat && info.parents.length > 0) {
                // Show stat would require diff calculation
                // For simplicity, just show file names changed
                printCommitStat(repoRoot, sha, info);
            }
        }
    }
    return 0;
}
function getCommitInfo(repoRoot, sha) {
    try {
        const { type, content } = (0, objects_1.readObject)(repoRoot, sha);
        if (type !== 'commit')
            return null;
        return (0, objects_1.parseCommitContent)(content);
    }
    catch {
        return null;
    }
}
function printCommitStat(repoRoot, sha, info) {
    if (info.parents.length === 0)
        return;
    const parentSha = info.parents[0];
    const parentInfo = getCommitInfo(repoRoot, parentSha);
    if (!parentInfo)
        return;
    // Get files in both trees
    const currentFiles = getTreeFiles(repoRoot, info.tree);
    const parentFiles = getTreeFiles(repoRoot, parentInfo.tree);
    const allFiles = new Set([...currentFiles.keys(), ...parentFiles.keys()]);
    const changedFiles = [];
    for (const file of allFiles) {
        const currentSha = currentFiles.get(file);
        const parentSha = parentFiles.get(file);
        if (currentSha !== parentSha) {
            changedFiles.push(file);
        }
    }
    for (const file of changedFiles.sort()) {
        console.log(` ${file}`);
    }
    console.log('');
}
function getTreeFiles(repoRoot, treeSha, prefix = '') {
    const files = new Map();
    try {
        const { content } = (0, objects_1.readObject)(repoRoot, treeSha);
        const { parseTreeContent } = require('../objects');
        const entries = parseTreeContent(content);
        for (const entry of entries) {
            const fullName = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.mode === '40000') {
                const subFiles = getTreeFiles(repoRoot, entry.sha, fullName);
                for (const [name, sha] of subFiles) {
                    files.set(name, sha);
                }
            }
            else {
                files.set(fullName, entry.sha);
            }
        }
    }
    catch {
        // Ignore errors
    }
    return files;
}
