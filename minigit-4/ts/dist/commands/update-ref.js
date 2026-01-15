"use strict";
// update-ref command - Update reference
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
    if (args.length < 2) {
        console.error('fatal: update-ref requires <ref> <sha>');
        return 1;
    }
    const refName = args[0];
    const sha = args[1];
    // Validate SHA (should be 40 hex chars or abbreviated)
    if (!/^[0-9a-f]{4,40}$/.test(sha)) {
        console.error(`fatal: ${sha} is not a valid SHA`);
        return 1;
    }
    if (refName === 'HEAD') {
        (0, refs_1.writeHead)(repoRoot, sha);
    }
    else {
        (0, refs_1.updateRef)(repoRoot, refName, sha);
    }
    return 0;
}
