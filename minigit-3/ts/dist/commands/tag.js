"use strict";
// tag command - Manage tags
Object.defineProperty(exports, "__esModule", { value: true });
exports.tag = tag;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function tag(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a git repository');
        process.exit(1);
    }
    let deleteMode = false;
    let annotated = false;
    let message = '';
    let listMode = false;
    const positionalArgs = [];
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-d') {
            deleteMode = true;
        }
        else if (arg === '-a') {
            annotated = true;
        }
        else if (arg === '-m' && i + 1 < args.length) {
            annotated = true;
            message = args[++i];
        }
        else if (arg === '-l' || arg === '--list') {
            listMode = true;
        }
        else if (!arg.startsWith('-')) {
            positionalArgs.push(arg);
        }
    }
    if (deleteMode) {
        if (positionalArgs.length === 0) {
            console.error('fatal: tag name required');
            process.exit(1);
        }
        deleteTagCmd(positionalArgs[0], repoRoot);
    }
    else if (listMode || positionalArgs.length === 0) {
        listTagsCmd(repoRoot);
    }
    else {
        const tagName = positionalArgs[0];
        const target = positionalArgs.length > 1 ? positionalArgs[1] : 'HEAD';
        createTagCmd(tagName, target, annotated, message, repoRoot);
    }
}
function listTagsCmd(repoRoot) {
    const tags = (0, refs_1.listTags)(repoRoot);
    for (const tagName of tags) {
        console.log(tagName);
    }
}
function createTagCmd(name, target, annotated, message, repoRoot) {
    if ((0, refs_1.tagExists)(name, repoRoot)) {
        console.error(`fatal: tag '${name}' already exists`);
        process.exit(1);
    }
    const sha = (0, refs_1.resolveRef)(target, repoRoot);
    if (!sha) {
        console.error(`fatal: not a valid object name: '${target}'`);
        process.exit(1);
    }
    if (annotated) {
        // Create annotated tag object
        const tagger = (0, utils_1.getAuthorInfo)();
        const tagObj = {
            object: sha,
            type: 'commit',
            tag: name,
            tagger: (0, utils_1.formatAuthor)(tagger.name, tagger.email, tagger.date),
            message: message || ''
        };
        const tagSha = (0, objects_1.writeTag)(tagObj, repoRoot);
        (0, refs_1.createTag)(name, tagSha, repoRoot);
    }
    else {
        // Create lightweight tag
        (0, refs_1.createTag)(name, sha, repoRoot);
    }
}
function deleteTagCmd(name, repoRoot) {
    if (!(0, refs_1.tagExists)(name, repoRoot)) {
        console.error(`error: tag '${name}' not found`);
        process.exit(1);
    }
    (0, refs_1.deleteTag)(name, repoRoot);
    console.log(`Deleted tag '${name}'`);
}
