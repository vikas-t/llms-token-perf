"use strict";
// symbolic-ref command - Manage symbolic refs
Object.defineProperty(exports, "__esModule", { value: true });
exports.symbolicRef = symbolicRef;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function symbolicRef(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    if (args.length === 0) {
        console.error('fatal: symbolic-ref requires <name>');
        return 1;
    }
    const name = args[0];
    const target = args[1];
    if (target) {
        // Set symbolic ref
        (0, refs_1.writeSymbolicRef)(repoRoot, name, target);
        return 0;
    }
    // Read symbolic ref
    const value = (0, refs_1.readSymbolicRef)(repoRoot, name);
    if (!value) {
        console.error(`fatal: ref ${name} is not a symbolic ref`);
        return 1;
    }
    console.log(value);
    return 0;
}
