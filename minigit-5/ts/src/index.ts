#!/usr/bin/env node

// Mini Git CLI entry point

import { init } from './commands/init';
import { add } from './commands/add';
import { commit } from './commands/commit';
import { status } from './commands/status';
import { log } from './commands/log';
import { diff } from './commands/diff';
import { branch } from './commands/branch';
import { checkout } from './commands/checkout';
import { merge } from './commands/merge';
import { tag } from './commands/tag';
import { show } from './commands/show';
import { catFile } from './commands/cat-file';
import { lsTree } from './commands/ls-tree';
import { lsFiles } from './commands/ls-files';
import { revParse } from './commands/rev-parse';
import { hashObjectCmd } from './commands/hash-object';
import { updateRefCmd } from './commands/update-ref';
import { symbolicRef } from './commands/symbolic-ref';

const command = process.argv[2];
const args = process.argv.slice(3);

const commands: Record<string, (args: string[]) => number> = {
  'init': init,
  'add': add,
  'commit': commit,
  'status': status,
  'log': log,
  'diff': diff,
  'branch': branch,
  'checkout': checkout,
  'merge': merge,
  'tag': tag,
  'show': show,
  'cat-file': catFile,
  'ls-tree': lsTree,
  'ls-files': lsFiles,
  'rev-parse': revParse,
  'hash-object': hashObjectCmd,
  'update-ref': updateRefCmd,
  'symbolic-ref': symbolicRef,
};

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
  const exitCode = handler(args);
  process.exit(exitCode);
} catch (e: any) {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
}
