"use strict";
// symbolic-ref command - Manage symbolic references
Object.defineProperty(exports, "__esModule", { value: true });
exports.symbolicRef = symbolicRef;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
function symbolicRef(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    if (args.length === 0) {
        console.error('usage: symbolic-ref <name> [<ref>]');
        process.exit(1);
    }
    const refName = args[0];
    const targetRef = args[1];
    if (targetRef) {
        // Set symbolic ref
        (0, refs_1.setSymbolicRef)(refName, targetRef, repoRoot);
    }
    else {
        // Read symbolic ref
        const target = (0, refs_1.getSymbolicRef)(refName, repoRoot);
        if (target) {
            console.log(target);
        }
        else {
            console.error(`fatal: ref ${refName} is not a symbolic ref`);
            process.exit(1);
        }
    }
}
