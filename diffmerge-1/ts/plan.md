# Diff/Merge Library: TypeScript Implementation

## Task

Implement a Diff/Merge library in TypeScript. All 125 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `ts/` directory
- Run any bash commands (npm install, npm run build, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party diff/merge libraries (e.g., diff, jsdiff, diff-match-patch)
- Only Node.js built-ins and TypeScript are allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `ts/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `go/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 125 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the test interface.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
ts/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts         # Package entry - exports public API (under 50 lines)
│   ├── diff.ts          # diff_lines, diff_words, diff_chars, LCS algorithm
│   ├── patch.ts         # create_patch, apply_patch, reverse_patch, parse_patch
│   ├── merge.ts         # merge3, has_conflicts, extract_conflicts, resolve_conflict
│   ├── utils.ts         # get_stats, is_binary, normalize_line_endings, split_lines
│   └── types.ts         # All type definitions (DiffHunk, MergeResult, etc.)
└── dist/                # Compiled output
    └── index.js
```

**MANDATORY REQUIREMENTS:**
- `src/index.ts` MUST be under 50 lines - it only imports and re-exports from modules
- Each module (`diff.ts`, `patch.ts`, `merge.ts`, `utils.ts`, `types.ts`) MUST exist as a separate file
- **MINIMUM 6 .ts FILES REQUIRED** in src/
- This structure is REQUIRED and will be verified

### Module Responsibilities

**diff.ts:**
- `diffLines(old, new, options)` - Line-by-line diff using LCS
- `diffWords(old, new)` - Word-by-word diff
- `diffChars(old, new)` - Character diff
- LCS algorithm implementation

**patch.ts:**
- `createPatch(old, new, options)` - Generate unified diff
- `applyPatch(content, patch)` - Apply patch to content
- `reversePatch(patch)` - Reverse a patch
- `parsePatch(patch)` - Parse unified diff format

**merge.ts:**
- `merge3(base, ours, theirs, options)` - Three-way merge
- `hasConflicts(content)` - Check for conflict markers
- `extractConflicts(content)` - Extract conflict regions
- `resolveConflict(content, index, resolution)` - Resolve conflict

**utils.ts:**
- `getStats(diff)` - Get diff statistics
- `isBinary(content)` - Detect binary content
- `normalizeLineEndings(content)` - Normalize to \n
- `splitLines(content)` - Split into lines

**types.ts:**
- `DiffOp`, `DiffHunk`, `DiffResult`, `DiffStats`
- `MergeResult`, `Conflict`
- `ApplyResult`, `ParsedPatch`, `PatchHunk`, `PatchLine`
- `DiffOptions`, `PatchOptions`, `MergeOptions`

## Setup

Initialize TypeScript project:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/diffmerge-1/ts
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
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

Add build script to package.json:
```json
{
  "scripts": {
    "build": "tsc"
  }
}
```

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/diffmerge-1/ts
npm run build
cd ..
IMPL=ts pytest tests -v
```

## Success Criteria

- All 125 tests pass
- Implementation only in `ts/` directory
- `npm run build` succeeds without errors
- **MUST have modular structure with 6 separate .ts files in src/**
- **`src/index.ts` MUST be under 50 lines**
- Each function in the correct module as specified above
