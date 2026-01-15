"use strict";
// rev-parse command - Resolve revisions
Object.defineProperty(exports, "__esModule", { value: true });
exports.revParse = revParse;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function revParse(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    const revisions = [];
    for (const arg of args) {
        if (!arg.startsWith('-')) {
            revisions.push(arg);
        }
    }
    if (revisions.length === 0) {
        console.error('fatal: revision required');
        return 1;
    }
    for (const rev of revisions) {
        try {
            const sha = (0, refs_1.resolveRevision)(rev, repoRoot);
            console.log(sha);
        }
        catch (e) {
            console.error(`fatal: ${e.message}`);
            return 1;
        }
    }
    return 0;
}
