# KVStore: TypeScript Implementation

## Task

Implement a key-value store HTTP API in TypeScript. All 52 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `ts/` directory
- Run any bash commands (npm install, tsc, etc.)
- Run tests as many times as needed
- Install any dependencies required

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `ts/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `go/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 52 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the requirements.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
ts/
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── src/
│   ├── index.ts             # HTTP server entry point with CLI parsing
│   ├── store.ts             # Core KVStore class (in-memory storage, TTL)
│   ├── wal.ts               # Write-Ahead Log implementation
│   ├── server.ts            # HTTP routes and handlers
│   └── utils.ts             # Helper functions (timestamp, expiration check)
└── dist/                    # Compiled JavaScript (generated)
```

**MANDATORY REQUIREMENTS:**
- `index.ts` as the entry point that starts the HTTP server
- Separate module for core storage logic (`store.ts`)
- Separate module for WAL persistence (`wal.ts`)
- Separate module for HTTP routing (`server.ts`)
- **MINIMUM 5 SOURCE FILES REQUIRED** (entry + 4 modules)
- Use a proper HTTP framework (Express, Fastify, or similar)

### Recommended Stack

- **HTTP Framework**: Express or Fastify (choose one)
- **Types**: `@types/node`, `@types/express` (if using Express)
- **Concurrency**: Node.js is single-threaded, but use proper async/await patterns
- **File I/O**: Node's `fs` module (use `fs.promises` for async)

### Key Components

**store.ts:**
- `KVStore` class with CRUD operations
- In-memory `Map<string, any>` for key-value storage
- TTL tracking (store expiration timestamps)
- Lazy expiration (check on access)

**wal.ts:**
- `WAL` class for write-ahead logging
- Append operations to log file (use append mode)
- Replay log on startup

**server.ts:**
- HTTP route handlers for all endpoints
- Request/response formatting
- Integration with KVStore and WAL
- Export Express/Fastify app

**index.ts:**
- Parse command-line arguments (--port, --data-dir)
- Initialize KVStore and WAL
- Start HTTP server

## Configuration

**package.json** should include:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**tsconfig.json** should target ES2020+ with Node module resolution.

## Testing

Run tests from the `ts/` directory:

```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/kvstore-3/ts
npm install
npm run build
KVSTORE_IMPL=typescript KVSTORE_PORT=18081 pytest ../tests -v
```

Run specific test file:
```bash
KVSTORE_IMPL=typescript KVSTORE_PORT=18081 pytest ../tests/test_crud.py -v
```

## Success Criteria

- All 52 tests pass
- Implementation only in `ts/` directory
- **MUST have exactly 5+ source files** (entry point + 4+ modules)
- Proper modular structure with separated concerns
- Persistence via WAL
- Clean TypeScript with proper types
