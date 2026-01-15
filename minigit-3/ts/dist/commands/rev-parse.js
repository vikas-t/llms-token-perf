"use strict";
// rev-parse command - Resolve revisions
Object.defineProperty(exports, "__esModule", { value: true });
exports.revParse = revParse;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function revParse(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    if (args.length === 0) {
        console.error('fatal: revision required');
        process.exit(1);
    }
    const revision = args[0];
    const sha = (0, refs_1.resolveRef)(revision, repoRoot);
    if (!sha) {
        console.error(`fatal: bad revision '${revision}'`);
        process.exit(1);
    }
    console.log(sha);
}
