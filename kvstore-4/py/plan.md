# KVStore: Python Implementation

## Task

Implement a key-value store HTTP API in Python. All 52 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `py/` directory
- Run any bash commands (pip install, pytest, etc.)
- Run tests as many times as needed
- Install any dependencies required

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `py/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `go/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 52 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the requirements.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
py/
├── main.py                  # HTTP server entry point with CLI parsing
├── kvstore/                 # Main package
│   ├── __init__.py          # Package init
│   ├── store.py             # Core KVStore class (in-memory storage, TTL)
│   ├── wal.py               # Write-Ahead Log implementation
│   ├── server.py            # HTTP routes and handlers
│   └── utils.py             # Helper functions (timestamp, expiration check)
└── requirements.txt         # Dependencies (Flask/FastAPI/etc)
```

**MANDATORY REQUIREMENTS:**
- `main.py` as the entry point that starts the HTTP server
- Separate module for core storage logic (`store.py`)
- Separate module for WAL persistence (`wal.py`)
- Separate module for HTTP routing (`server.py`)
- **MINIMUM 5 FILES REQUIRED** (entry + 4 modules)
- Use a proper HTTP framework (Flask, FastAPI, or similar)

### Recommended Stack

- **HTTP Framework**: Flask or FastAPI (choose one)
- **Threading**: Python's `threading.Lock` for synchronization
- **JSON**: Built-in `json` module
- **File I/O**: Built-in file operations

### Key Components

**store.py:**
- `KVStore` class with thread-safe operations
- In-memory dict for key-value storage
- TTL tracking (store expiration timestamps)
- Lazy expiration (check on access)

**wal.py:**
- `WAL` class for write-ahead logging
- Append operations to log file
- Replay log on startup

**server.py:**
- HTTP route handlers for all endpoints
- Request/response formatting
- Integration with KVStore and WAL

**main.py:**
- Parse command-line arguments (--port, --data-dir)
- Initialize KVStore and WAL
- Start HTTP server

## Testing

Run tests from the `py/` directory:

```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/kvstore-4/py
KVSTORE_IMPL=python KVSTORE_PORT=18080 pytest ../tests -v
```

Run specific test file:
```bash
KVSTORE_IMPL=python KVSTORE_PORT=18080 pytest ../tests/test_crud.py -v
```

## Success Criteria

- All 52 tests pass
- Implementation only in `py/` directory
- **MUST have exactly 5+ files** (entry point + 4+ modules)
- Proper modular structure with separated concerns
- Thread-safe concurrent access
- Persistence via WAL
