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
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let recursive = false;
    let nameOnly = false;
    let treeIsh = null;
    // Parse arguments
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
        process.exit(1);
    }
    // Resolve tree-ish
    let treeSha = (0, refs_1.resolveRef)(treeIsh, repoRoot);
    if (!treeSha) {
        console.error(`fatal: not a valid object name ${treeIsh}`);
        process.exit(1);
    }
    // If it's a commit, get its tree
    const obj = (0, objects_1.readObject)(treeSha, repoRoot);
    if (obj.type === 'commit') {
        const commit = (0, objects_1.parseCommit)(obj.content);
        treeSha = commit.tree;
    }
    else if (obj.type !== 'tree') {
        console.error(`fatal: ${treeIsh} is not a tree`);
        process.exit(1);
    }
    // List tree contents
    listTree(treeSha, '', recursive, nameOnly, repoRoot);
}
function listTree(treeSha, prefix, recursive, nameOnly, repoRoot) {
    const obj = (0, objects_1.readObject)(treeSha, repoRoot);
    const entries = (0, objects_1.parseTree)(obj.content);
    for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        const type = entry.mode === '040000' || entry.mode.startsWith('40') ? 'tree' : 'blob';
        if (nameOnly) {
            if (type === 'tree' && recursive) {
                listTree(entry.sha, name, recursive, nameOnly, repoRoot);
            }
            else if (type === 'blob') {
                console.log(name);
            }
        }
        else {
            console.log(`${entry.mode} ${type} ${entry.sha}\t${name}`);
            if (type === 'tree' && recursive) {
                listTree(entry.sha, name, recursive, nameOnly, repoRoot);
            }
        }
    }
}
