"use strict";
// cat-file command - Examine objects
Object.defineProperty(exports, "__esModule", { value: true });
exports.catFile = catFile;
const utils_1 = require("../utils");
const refs_1 = require("../refs");
const objects_1 = require("../objects");
function catFile(args) {
    const repoRoot = (0, utils_1.findRepoRoot)();
    if (!repoRoot) {
        console.error('fatal: not a minigit repository');
        return 1;
    }
    // Parse arguments
    let showType = false;
    let showSize = false;
    let prettyPrint = false;
    let objectType = null;
    let objectRef = null;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-t') {
            showType = true;
        }
        else if (arg === '-s') {
            showSize = true;
        }
        else if (arg === '-p') {
            prettyPrint = true;
        }
        else if (['blob', 'tree', 'commit', 'tag'].includes(arg)) {
            objectType = arg;
        }
        else if (!arg.startsWith('-')) {
            objectRef = arg;
        }
    }
    if (!objectRef) {
        console.error('fatal: object reference required');
        return 1;
    }
    // Resolve object
    let sha;
    try {
        sha = (0, refs_1.resolveRevision)(objectRef, repoRoot);
    }
    catch {
        // Try as raw SHA
        try {
            sha = (0, objects_1.expandShortSha)(objectRef, repoRoot);
        }
        catch (e) {
            console.error(`fatal: Not a valid object name ${objectRef}`);
            return 1;
        }
    }
    // Read object
    let obj;
    try {
        obj = (0, objects_1.readObject)(sha, repoRoot);
    }
    catch (e) {
        console.error(`fatal: Not a valid object name ${objectRef}`);
        return 1;
    }
    const { type, content } = obj;
    // Check type if specified
    if (objectType && type !== objectType) {
        console.error(`fatal: expected ${objectType}, got ${type}`);
        return 1;
    }
    // Output based on flags
    if (showType) {
        console.log(type);
        return 0;
    }
    if (showSize) {
        console.log(content.length.toString());
        return 0;
    }
    if (prettyPrint || objectType) {
        switch (type) {
            case 'blob':
                process.stdout.write(content);
                break;
            case 'tree':
                const entries = (0, objects_1.getTree)(sha, repoRoot);
                for (const entry of entries) {
                    const entryType = entry.mode === '40000' ? 'tree' : 'blob';
                    // Pad mode to 6 chars for regular files
                    const modeStr = entry.mode === '40000' ? '040000' : entry.mode;
                    console.log(`${modeStr} ${entryType} ${entry.sha}\t${entry.name}`);
                }
                break;
            case 'commit':
                const commit = (0, objects_1.getCommit)(sha, repoRoot);
                console.log(`tree ${commit.tree}`);
                for (const parent of commit.parents) {
                    console.log(`parent ${parent}`);
                }
                console.log(`author ${commit.author}`);
                console.log(`committer ${commit.committer}`);
                console.log('');
                console.log(commit.message);
                break;
            case 'tag':
                const tag = (0, objects_1.parseTag)(content);
                console.log(`object ${tag.object}`);
                console.log(`type ${tag.objectType}`);
                console.log(`tag ${tag.tagName}`);
                console.log(`tagger ${tag.tagger}`);
                console.log('');
                console.log(tag.message);
                break;
            default:
                console.error(`Unknown object type: ${type}`);
                return 1;
        }
        return 0;
    }
    // Raw output
    process.stdout.write(content);
    return 0;
}
