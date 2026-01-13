# Mini Git: TypeScript Implementation

## Task

Implement a Mini Git version control system in TypeScript. All 175 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `ts/` directory
- Run any bash commands (npm install, npm run build, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party git/VCS libraries (e.g., isomorphic-git, simple-git, nodegit)
- Do NOT use any libraries that implement git functionality
- Only Node.js built-ins and basic npm packages are allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `ts/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `go/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 175 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory, `spec.md`, and `conftest.py` to understand the test interface.

## IMPORTANT: CLI Entry Point

**You MUST create `src/index.ts` that compiles to `dist/index.js`:**
1. Reads command from `process.argv[2]`
2. Processes remaining arguments from `process.argv.slice(3)`
3. Delegates to command modules (does NOT implement commands itself)
4. Exits with appropriate status codes

The tests invoke: `node ts/dist/index.js <command> [args...]`

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

**CRITICAL: Each of the 18 commands MUST be in its own separate file in the `commands/` directory.**

```
ts/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # CLI entry point ONLY - MUST be under 100 lines
│   ├── types.ts            # Type definitions (interfaces, types)
│   ├── commands/           # ONE FILE PER COMMAND (18 files required)
│   │   ├── init.ts         # init command
│   │   ├── add.ts          # add command
│   │   ├── commit.ts       # commit command
│   │   ├── status.ts       # status command
│   │   ├── log.ts          # log command
│   │   ├── diff.ts         # diff command
│   │   ├── branch.ts       # branch command
│   │   ├── checkout.ts     # checkout command
│   │   ├── merge.ts        # merge command
│   │   ├── tag.ts          # tag command
│   │   ├── show.ts         # show command
│   │   ├── cat-file.ts     # cat-file command
│   │   ├── ls-tree.ts      # ls-tree command
│   │   ├── ls-files.ts     # ls-files command
│   │   ├── rev-parse.ts    # rev-parse command
│   │   ├── hash-object.ts  # hash-object command
│   │   ├── update-ref.ts   # update-ref command
│   │   └── symbolic-ref.ts # symbolic-ref command
│   ├── objects.ts          # Blob, Tree, Commit, Tag handling
│   ├── index-file.ts       # Binary index read/write
│   ├── refs.ts             # Reference management (HEAD, branches, tags)
│   ├── diff-algo.ts        # Myers diff algorithm
│   ├── merge-algo.ts       # Three-way merge with conflict detection
│   └── utils.ts            # SHA-1, zlib, path utilities
└── dist/                   # Compiled output
    └── index.js            # CLI entry point
```

**MANDATORY REQUIREMENTS:**
- `src/index.ts` MUST be under 100 lines - it ONLY parses the command name and delegates
- Each of the 18 commands MUST be in its own file in `src/commands/` directory
- Each core module (`types.ts`, `objects.ts`, `index-file.ts`, `refs.ts`, `diff-algo.ts`, `merge-algo.ts`, `utils.ts`) MUST exist
- **MINIMUM 25 .ts FILES REQUIRED** (1 entry + 18 command files + 7 core modules)
- This structure is REQUIRED and will be verified

### Key Libraries
- `crypto` (built-in) for SHA-1
- `zlib` (built-in) for compression
- `fs`, `path` (built-in) for file operations

### Commands to Implement (18 total)

**Core Commands:**
- `init` - Initialize repository
- `add` - Stage files
- `commit` - Create commit
- `status` - Show status
- `log` - Show history
- `diff` - Show changes

**Branch Commands:**
- `branch` - Manage branches
- `checkout` - Switch branches/restore files
- `merge` - Merge branches
- `tag` - Manage tags

**Inspection Commands:**
- `show` - Show object content
- `cat-file` - Examine objects
- `ls-tree` - List tree contents
- `ls-files` - List indexed files
- `rev-parse` - Resolve revisions

**Low-level Commands:**
- `hash-object` - Compute hash
- `update-ref` - Update reference
- `symbolic-ref` - Manage symbolic refs

## Setup

Initialize TypeScript project:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/minigit-5/ts
npm init -y
npm install typescript @types/node --save-dev
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/minigit-5/ts
npm run build
MINIGIT_IMPL=ts pytest ../tests -v
```

## Success Criteria

- All 175 tests pass
- Implementation only in `ts/` directory
- CLI compiles to `dist/index.js`
- `npm run build` succeeds without errors
- **MUST have exactly 25+ .ts files in src/** (entry point + 18 command files + 7 core modules)
- **Entry point MUST be under 100 lines**
- **Each command MUST be in its own file**
