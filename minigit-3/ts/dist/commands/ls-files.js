"use strict";
// ls-files command - List indexed files
Object.defineProperty(exports, "__esModule", { value: true });
exports.lsFiles = lsFiles;
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
function lsFiles(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let showStaged = false;
    // Parse arguments
    for (const arg of args) {
        if (arg === '--stage' || arg === '--staged' || arg === '-s') {
            showStaged = true;
        }
    }
    const entries = (0, index_file_1.readIndex)(repoRoot);
    for (const entry of entries) {
        if (showStaged) {
            const mode = entry.mode.toString(8).padStart(6, '0');
            const stage = 0; // Stage 0 for normal entries
            console.log(`${mode} ${entry.sha} ${stage}\t${entry.name}`);
        }
        else {
            console.log(entry.name);
        }
    }
}
