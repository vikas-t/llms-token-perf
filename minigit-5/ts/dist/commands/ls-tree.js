"use strict";
// ls-tree command - List tree contents
Object.defineProperty(exports, "__esModule", { value: true });
exports.lsTree = lsTree;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function lsTree(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let recursive = false;
    let nameOnly = false;
    let treeIsh = null;
    for (const arg of args) {
        if (arg === '-r') {
            recursive = true;
        }
        else if (arg === '--name-only') {
            nameOnly = true;
        }
        else if (!arg.startsWith('-')) {
            treeIsh = arg;
        }
    }
    if (!treeIsh) {
        console.error('fatal: tree-ish required');
        return 1;
    }
    // Resolve to tree SHA
    let treeSha;
    try {
        const sha = (0, refs_1.resolveRevision)(treeIsh, repoRoot);
        treeSha = (0, objects_1.getTreeFromTreeIsh)(sha, repoRoot);
    }
    catch (e) {
        console.error(`fatal: ${e.message}`);
        return 1;
    }
    // List tree
    listTree(treeSha, '', recursive, nameOnly, repoRoot);
    return 0;
}
function listTree(treeSha, prefix, recursive, nameOnly, repoRoot) {
    const entries = (0, objects_1.getTree)(treeSha, repoRoot);
    for (const entry of entries) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isDir = entry.mode === '40000';
        const type = isDir ? 'tree' : 'blob';
        if (nameOnly) {
            if (!isDir || !recursive) {
                console.log(fullPath);
            }
        }
        else {
            // Pad mode for display
            const modeStr = entry.mode === '40000' ? '040000' : entry.mode;
            console.log(`${modeStr} ${type} ${entry.sha}\t${fullPath}`);
        }
        if (recursive && isDir) {
            listTree(entry.sha, fullPath, recursive, nameOnly, repoRoot);
        }
    }
}
