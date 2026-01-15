"use strict";
// update-ref command - Update reference
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRef = updateRef;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function updateRef(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    if (args.length < 2) {
        console.error('usage: update-ref <ref> <sha>');
        process.exit(1);
    }
    const refName = args[0];
    const sha = args[1];
    // Resolve short SHA if needed
    let fullSha = sha;
    if (sha.length < 40) {
        const resolved = (0, refs_1.resolveRef)(sha, repoRoot);
        if (resolved) {
            fullSha = resolved;
        }
    }
    // Validate SHA format
    if (!/^[0-9a-f]{40}$/.test(fullSha)) {
        console.error(`fatal: ${sha}: not a valid SHA1`);
        process.exit(1);
    }
    (0, refs_1.writeRef)(refName, fullSha, repoRoot);
}
