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
    const showStaged = args.includes('--staged') || args.includes('-s');
    const entries = (0, index_file_1.readIndex)(repoRoot);
    for (const entry of entries) {
        if (showStaged) {
            // Format: mode sha stage path
            const modeStr = entry.mode.toString(8).padStart(6, '0');
            const stage = (entry.flags >> 12) & 0x3;
            console.log(`${modeStr} ${entry.sha} ${stage}\t${entry.name}`);
        }
        else {
            console.log(entry.name);
        }
    }
    return 0;
}
