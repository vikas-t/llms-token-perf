# KVStore: Go Implementation

## Task

Implement a key-value store HTTP API in Go. All 52 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `go/` directory
- Run any bash commands (go build, go run, etc.)
- Run tests as many times as needed
- Install any dependencies required

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `go/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 52 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the requirements.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
go/
├── go.mod                   # Go module file
├── main.go                  # HTTP server entry point with CLI parsing
├── store/
│   ├── store.go             # Core KVStore with mutex-protected map
│   └── ttl.go               # TTL expiration logic
├── wal/
│   └── wal.go               # Write-Ahead Log implementation
└── server/
    └── handlers.go          # HTTP route handlers
```

**MANDATORY REQUIREMENTS:**
- `main.go` as the entry point that starts the HTTP server
- Separate package for core storage logic (`store/`)
- Separate package for WAL persistence (`wal/`)
- Separate package for HTTP handlers (`server/`)
- **MINIMUM 5 GO FILES REQUIRED** (main.go + 4+ package files)
- Use Go's standard library HTTP server (`net/http`)

### Recommended Stack

- **HTTP**: `net/http` (standard library)
- **JSON**: `encoding/json` (standard library)
- **Concurrency**: `sync.RWMutex` for thread-safe access
- **File I/O**: `os` package with `bufio` for efficient writing

### Key Components

**store/store.go:**
- `KVStore` struct with `sync.RWMutex`
- In-memory `map[string]interface{}` for key-value storage
- Thread-safe Get/Set/Delete/List methods
- Integration with TTL checking

**store/ttl.go:**
- TTL tracking with expiration timestamps
- Lazy expiration check functions
- Background cleanup (optional but recommended)

**wal/wal.go:**
- `WAL` struct for write-ahead logging
- Append operations to log file
- Replay log on startup
- Thread-safe writes

**server/handlers.go:**
- HTTP handler functions for all endpoints:
  - `HandleStats(w http.ResponseWriter, r *http.Request)`
  - `HandleListKeys(w http.ResponseWriter, r *http.Request)`
  - `HandleGet(w http.ResponseWriter, r *http.Request)`
  - `HandlePut(w http.ResponseWriter, r *http.Request)`
  - `HandleDelete(w http.ResponseWriter, r *http.Request)`
  - `HandleBatch(w http.ResponseWriter, r *http.Request)`
- Request/response JSON marshaling
- Integration with KVStore and WAL

**main.go:**
- Parse command-line flags (--port, --data-dir)
- Initialize KVStore and WAL
- Set up HTTP routes with `http.HandleFunc` or router
- Start HTTP server

## Module Setup

Initialize Go module:
```bash
cd go/
go mod init kvstore
```

## Testing

Run tests from the `go/` directory:

```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/kvstore-5/go
go build -o kvstore
KVSTORE_IMPL=go KVSTORE_PORT=18082 pytest ../tests -v
```

Run specific test file:
```bash
KVSTORE_IMPL=go KVSTORE_PORT=18082 pytest ../tests/test_crud.py -v
```

## Success Criteria

- All 52 tests pass
- Implementation only in `go/` directory
- **MUST have exactly 5+ Go files** (main.go + 4+ package files)
- Proper modular structure with separated packages
- Thread-safe concurrent access with mutex
- Persistence via WAL
- Clean Go code following standard conventions
