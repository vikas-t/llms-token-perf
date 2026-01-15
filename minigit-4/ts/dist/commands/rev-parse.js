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
    if (args.length === 0) {
        console.error('fatal: revision required');
        return 1;
    }
    const rev = args[0];
    const sha = (0, refs_1.resolveRevision)(repoRoot, rev);
    if (!sha) {
        console.error(`fatal: ambiguous argument '${rev}': unknown revision`);
        return 1;
    }
    console.log(sha);
    return 0;
}
