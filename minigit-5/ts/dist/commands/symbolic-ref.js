"use strict";
// symbolic-ref command - Manage symbolic references
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
    // Parse arguments
    const positionalArgs = [];
    for (const arg of args) {
        if (!arg.startsWith('-')) {
            positionalArgs.push(arg);
        }
    }
    if (positionalArgs.length === 0) {
        console.error('usage: minigit symbolic-ref <name> [<ref>]');
        return 1;
    }
    const refName = positionalArgs[0];
    if (positionalArgs.length === 1) {
        // Read mode
        if (refName === 'HEAD') {
            const head = (0, refs_1.getHead)(repoRoot);
            if (head.startsWith('ref:')) {
                console.log(head.slice(5).trim());
                return 0;
            }
            else {
                console.error('fatal: ref HEAD is not a symbolic ref');
                return 1;
            }
        }
        const target = (0, refs_1.getSymbolicRef)(refName, repoRoot);
        if (target) {
            console.log(target);
            return 0;
        }
        else {
            console.error(`fatal: ref ${refName} is not a symbolic ref`);
            return 1;
        }
    }
    // Write mode
    const target = positionalArgs[1];
    if (refName === 'HEAD') {
        const { setHead } = require('../refs');
        setHead(`ref: ${target}`, repoRoot);
    }
    else {
        (0, refs_1.setSymbolicRef)(refName, target, repoRoot);
    }
    return 0;
}
