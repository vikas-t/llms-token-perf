"use strict";
// tag command - Create, list, or delete tags
Object.defineProperty(exports, "__esModule", { value: true });
exports.tag = tag;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function tag(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let annotated = false;
    let deleteMode = false;
    let listMode = false;
    let message = null;
    const positionalArgs = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-a') {
            annotated = true;
        }
        else if (arg === '-d') {
            deleteMode = true;
        }
        else if (arg === '-l') {
            listMode = true;
        }
        else if (arg === '-m' && i + 1 < args.length) {
            message = args[i + 1];
            annotated = true;
            i++;
        }
        else if (!arg.startsWith('-')) {
            positionalArgs.push(arg);
        }
    }
    // Delete mode
    if (deleteMode) {
        if (positionalArgs.length === 0) {
            console.error('fatal: tag name required');
            return 1;
        }
        for (const tagName of positionalArgs) {
            try {
                (0, refs_1.deleteTag)(tagName, repoRoot);
                console.log(`Deleted tag '${tagName}'`);
            }
            catch (e) {
                console.error(`error: tag '${tagName}' not found.`);
                return 1;
            }
        }
        return 0;
    }
    // List mode (default if no positional args)
    if (listMode || positionalArgs.length === 0) {
        const tags = (0, refs_1.listTags)(repoRoot);
        tags.sort();
        for (const t of tags) {
            console.log(t);
        }
        return 0;
    }
    // Create mode
    const tagName = positionalArgs[0];
    let targetSha;
    if (positionalArgs.length > 1) {
        try {
            targetSha = (0, refs_1.resolveRevision)(positionalArgs[1], repoRoot);
        }
        catch (e) {
            console.error(`fatal: ${e.message}`);
            return 1;
        }
    }
    else {
        const headSha = (0, refs_1.getHeadCommit)(repoRoot);
        if (!headSha) {
            console.error('fatal: Failed to resolve HEAD');
            return 1;
        }
        targetSha = headSha;
    }
    // Check if tag already exists
    if ((0, refs_1.resolveRef)(`refs/tags/${tagName}`, repoRoot)) {
        console.error(`fatal: tag '${tagName}' already exists`);
        return 1;
    }
    if (annotated) {
        // Create annotated tag object
        if (!message) {
            message = '';
        }
        const authorInfo = (0, utils_1.getAuthorInfo)();
        const tagger = (0, utils_1.formatAuthorDate)(authorInfo.name, authorInfo.email, authorInfo.date, authorInfo.tz);
        const objectType = (0, objects_1.getObjectType)(targetSha, repoRoot);
        const tagSha = (0, objects_1.createTag)(targetSha, objectType, tagName, tagger, message, repoRoot);
        (0, refs_1.createTag)(tagName, tagSha, repoRoot);
    }
    else {
        // Lightweight tag - just a ref
        (0, refs_1.createTag)(tagName, targetSha, repoRoot);
    }
    return 0;
}
