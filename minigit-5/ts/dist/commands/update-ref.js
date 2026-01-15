"use strict";
// update-ref command - Update a reference
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRefCmd = updateRefCmd;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function updateRefCmd(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    const positionalArgs = [];
    for (const arg of args) {
        if (!arg.startsWith('-')) {
            positionalArgs.push(arg);
        }
    }
    if (positionalArgs.length < 2) {
        console.error('usage: minigit update-ref <ref> <sha>');
        return 1;
    }
    const ref = positionalArgs[0];
    const sha = positionalArgs[1];
    // Validate SHA format
    if (!/^[0-9a-f]{40}$/.test(sha)) {
        console.error(`fatal: ${sha} is not a valid SHA`);
        return 1;
    }
    // Handle HEAD specially
    if (ref === 'HEAD') {
        (0, refs_1.setHead)(sha, repoRoot);
    }
    else {
        (0, refs_1.updateRef)(ref, sha, repoRoot);
    }
    return 0;
}
