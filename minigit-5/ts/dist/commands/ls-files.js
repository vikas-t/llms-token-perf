"use strict";
// ls-files command - List indexed files
Object.defineProperty(exports, "__esModule", { value: true });
exports.lsFiles = lsFiles;
const utils_1 = require("../utils");
const index_file_1 = require("../index-file");
function lsFiles(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let showStaged = false;
    for (const arg of args) {
        if (arg === '--staged' || arg === '-s') {
            showStaged = true;
        }
    }
    // Read index
    const index = (0, index_file_1.readIndex)(repoRoot);
    const entries = index.entries.slice().sort((a, b) => a.path.localeCompare(b.path));
    for (const entry of entries) {
        if (showStaged) {
            // Format: mode sha stage path
            const mode = entry.mode.toString(8).padStart(6, '0');
            const stage = 0; // Stage is always 0 for regular index entries
            console.log(`${mode} ${entry.sha} ${stage}\t${entry.path}`);
        }
        else {
            console.log(entry.path);
        }
    }
    return 0;
}
