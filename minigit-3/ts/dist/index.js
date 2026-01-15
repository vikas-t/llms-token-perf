#!/usr/bin/env node
"use strict";
// Mini Git CLI Entry Point
Object.defineProperty(exports, "__esModule", { value: true });
const init_1 = require("./commands/init");
const add_1 = require("./commands/add");
const commit_1 = require("./commands/commit");
const status_1 = require("./commands/status");
const log_1 = require("./commands/log");
const diff_1 = require("./commands/diff");
const branch_1 = require("./commands/branch");
const checkout_1 = require("./commands/checkout");
const merge_1 = require("./commands/merge");
const tag_1 = require("./commands/tag");
const show_1 = require("./commands/show");
const cat_file_1 = require("./commands/cat-file");
const ls_tree_1 = require("./commands/ls-tree");
const ls_files_1 = require("./commands/ls-files");
const rev_parse_1 = require("./commands/rev-parse");
const hash_object_1 = require("./commands/hash-object");
const update_ref_1 = require("./commands/update-ref");
const symbolic_ref_1 = require("./commands/symbolic-ref");
const commands = {
    'init': init_1.init,
    'add': add_1.add,
    'commit': commit_1.commit,
    'status': status_1.status,
    'log': log_1.log,
    'diff': diff_1.diff,
    'branch': branch_1.branch,
    'checkout': checkout_1.checkout,
    'merge': merge_1.merge,
    'tag': tag_1.tag,
    'show': show_1.show,
    'cat-file': cat_file_1.catFile,
    'ls-tree': ls_tree_1.lsTree,
    'ls-files': ls_files_1.lsFiles,
    'rev-parse': rev_parse_1.revParse,
    'hash-object': hash_object_1.hashObjectCmd,
    'update-ref': update_ref_1.updateRef,
    'symbolic-ref': symbolic_ref_1.symbolicRef
};
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const commandArgs = args.slice(1);
    if (!command) {
        console.error('usage: minigit <command> [<args>]');
        process.exit(1);
    }
    const handler = commands[command];
    if (!handler) {
        console.error(`minigit: '${command}' is not a minigit command`);
        process.exit(1);
    }
    try {
        handler(commandArgs);
    }
    catch (e) {
        if (e instanceof Error) {
            console.error(`fatal: ${e.message}`);
        }
        else {
            console.error('fatal: unknown error');
        }
        process.exit(1);
    }
}
main();
