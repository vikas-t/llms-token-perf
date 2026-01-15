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
    let annotated = false;
    let deleteFlag = false;
    let listFlag = false;
    let message = null;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-a') {
            annotated = true;
        }
        else if (args[i] === '-d') {
            deleteFlag = true;
        }
        else if (args[i] === '-l') {
            listFlag = true;
        }
        else if (args[i] === '-m' && i + 1 < args.length) {
            message = args[++i];
            annotated = true; // -m implies -a
        }
        else if (!args[i].startsWith('-')) {
            positional.push(args[i]);
        }
    }
    if (deleteFlag) {
        if (positional.length === 0) {
            console.error('fatal: tag name required');
            return 1;
        }
        return deleteTagCmd(repoRoot, positional[0]);
    }
    if (listFlag || positional.length === 0) {
        return listTags(repoRoot);
    }
    // Create tag
    const tagName = positional[0];
    const commitRef = positional[1];
    if (annotated) {
        if (!message) {
            console.error('fatal: -a requires -m <message>');
            return 1;
        }
        return createAnnotatedTag(repoRoot, tagName, commitRef, message);
    }
    return createLightweightTag(repoRoot, tagName, commitRef);
}
function listTags(repoRoot) {
    const tags = (0, refs_1.getTags)(repoRoot);
    for (const t of tags) {
        console.log(t);
    }
    return 0;
}
function createLightweightTag(repoRoot, tagName, commitRef) {
    if ((0, refs_1.tagExists)(repoRoot, tagName)) {
        console.error(`fatal: tag '${tagName}' already exists`);
        return 1;
    }
    let sha;
    if (commitRef) {
        sha = (0, refs_1.resolveRevision)(repoRoot, commitRef);
        if (!sha) {
            console.error(`fatal: not a valid object name: '${commitRef}'`);
            return 1;
        }
    }
    else {
        sha = (0, refs_1.getHeadCommit)(repoRoot);
        if (!sha) {
            console.error('fatal: not a valid object name: HEAD');
            return 1;
        }
    }
    (0, refs_1.createTag)(repoRoot, tagName, sha);
    return 0;
}
function createAnnotatedTag(repoRoot, tagName, commitRef, message) {
    if ((0, refs_1.tagExists)(repoRoot, tagName)) {
        console.error(`fatal: tag '${tagName}' already exists`);
        return 1;
    }
    let sha;
    if (commitRef) {
        sha = (0, refs_1.resolveRevision)(repoRoot, commitRef);
        if (!sha) {
            console.error(`fatal: not a valid object name: '${commitRef}'`);
            return 1;
        }
    }
    else {
        sha = (0, refs_1.getHeadCommit)(repoRoot);
        if (!sha) {
            console.error('fatal: not a valid object name: HEAD');
            return 1;
        }
    }
    const tagger = (0, utils_1.getAuthorInfo)();
    const tagInfo = {
        object: sha,
        type: 'commit',
        tag: tagName,
        tagger: tagger.name,
        taggerEmail: tagger.email,
        taggerTimestamp: tagger.timestamp,
        taggerTz: tagger.tz,
        message,
    };
    const tagContent = (0, objects_1.createTagContent)(tagInfo);
    const tagSha = (0, objects_1.writeObject)(repoRoot, tagContent);
    (0, refs_1.createTag)(repoRoot, tagName, tagSha);
    return 0;
}
function deleteTagCmd(repoRoot, tagName) {
    if (!(0, refs_1.tagExists)(repoRoot, tagName)) {
        console.error(`error: tag '${tagName}' not found`);
        return 1;
    }
    (0, refs_1.deleteTag)(repoRoot, tagName);
    console.log(`Deleted tag '${tagName}'`);
    return 0;
}
