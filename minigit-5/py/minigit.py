#!/usr/bin/env python3
"""Mini Git - A simplified Git implementation."""

import sys
import os

# Add the py directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 2:
        print("usage: minigit <command> [<args>]", file=sys.stderr)
        return 1

    command = sys.argv[1]
    args = sys.argv[2:]

    # Map commands to modules
    commands = {
        'init': 'init',
        'add': 'add',
        'commit': 'commit',
        'status': 'status',
        'log': 'log',
        'diff': 'diff',
        'branch': 'branch',
        'checkout': 'checkout',
        'merge': 'merge',
        'tag': 'tag',
        'show': 'show',
        'cat-file': 'cat_file',
        'ls-tree': 'ls_tree',
        'ls-files': 'ls_files',
        'rev-parse': 'rev_parse',
        'hash-object': 'hash_object',
        'update-ref': 'update_ref',
        'symbolic-ref': 'symbolic_ref',
    }

    if command not in commands:
        print(f"minigit: '{command}' is not a minigit command", file=sys.stderr)
        return 1

    module_name = commands[command]

    try:
        module = __import__(f'commands.{module_name}', fromlist=['run'])
        return module.run(args)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
