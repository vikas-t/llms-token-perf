# Key-Value Store HTTP API Specification

A production-grade key-value store with TTL expiration, write-ahead logging for persistence, thread-safe concurrent access, and batch operations. All 52 tests must pass.

## Overview

Implement an HTTP REST API server that provides a persistent key-value store with:
- **TTL/Expiration Support**: Keys can have time-to-live values
- **Write-Ahead Log (WAL)**: Persistence via append-only log
- **Thread-Safe Concurrency**: Multiple concurrent requests handled safely
- **Batch Operations**: Multiple operations in a single request
- **Prefix Scanning**: Filter keys by prefix

## API Endpoints

### GET /stats

Returns store statistics.

**Response:**
```json
{
  "keys": 5,
  "size_bytes": 1234
}
```

**Fields:**
- `keys` (integer): Total number of keys in the store
- `size_bytes` (integer): Total size of all values in bytes

---

### GET /kv

List all keys, with optional prefix filtering.

**Query Parameters:**
- `prefix` (string, optional): Filter keys by prefix

**Response:**
```json
{
  "keys": ["user:1", "user:2", "config:app"]
}
```

**Examples:**
- `GET /kv` → All keys
- `GET /kv?prefix=user:` → Keys starting with "user:"

---

### GET /kv/:key

Get value for a specific key.

**Response (if key exists):**
```json
{
  "value": "hello world"
}
```

**Response (if key not found):**
```json
{
  "error": "key not found"
}
```

**HTTP Status:**
- `200 OK` if key exists
- `404 Not Found` if key doesn't exist

---

### PUT /kv/:key

Set or update a key's value with optional TTL.

**Request Body:**
```json
{
  "value": "hello world",
  "ttl": 60
}
```

**Fields:**
- `value` (any): The value to store (can be string, number, boolean, null, object, array)
- `ttl` (integer, optional): Time-to-live in seconds

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- TTL is optional; if not provided, key never expires
- Setting a key that already exists overwrites it
- Values can be JSON types: string, number, boolean, null, object, array

---

### DELETE /kv/:key

Delete a key.

**Response (if key existed):**
```json
{
  "success": true
}
```

**Response (if key not found):**
```json
{
  "error": "key not found"
}
```

**HTTP Status:**
- `200 OK` if key was deleted
- `404 Not Found` if key doesn't exist

---

### POST /kv/batch

Execute multiple operations in a single request.

**Request Body:**
```json
{
  "operations": [
    {
      "op": "set",
      "key": "user:1",
      "value": "Alice",
      "ttl": 300
    },
    {
      "op": "get",
      "key": "user:1"
    },
    {
      "op": "delete",
      "key": "user:2"
    }
  ]
}
```

**Operation Types:**
- `set`: Set a key (requires `key`, `value`, optional `ttl`)
- `get`: Get a key's value (requires `key`)
- `delete`: Delete a key (requires `key`)

**Response:**
```json
{
  "results": [
    {"success": true},
    {"value": "Alice"},
    {"success": true}
  ]
}
```

**Notes:**
- Operations are executed in order
- Each result corresponds to the operation at the same index
- `get` operations return `{"value": ...}` or `{"error": "key not found"}`
- `set` and `delete` operations return `{"success": true}` or `{"error": ...}`

---

## Implementation Requirements

### 1. Persistence (Write-Ahead Log)

- All write operations (`set`, `delete`) must be logged to a WAL before being applied to memory
- WAL format: One JSON line per operation
  ```
  {"op":"set","key":"user:1","value":"Alice","ttl":300,"timestamp":1234567890}
  {"op":"delete","key":"user:2","timestamp":1234567891}
  ```
- On server startup, replay WAL to restore state
- WAL file location: `<DATA_DIR>/wal.log`

### 2. TTL/Expiration

- Keys with TTL should automatically expire after the specified time
- Expired keys should:
  - Return 404 on GET requests
  - Not appear in key listings
  - Be cleaned up from memory (lazy deletion is acceptable)
- TTL is in seconds

### 3. Thread-Safety/Concurrency

- The server must handle multiple concurrent requests safely
- Use appropriate locking/synchronization mechanisms
- No race conditions or data corruption under concurrent load

### 4. Configuration

**Environment Variables:**
- `PORT`: HTTP server port (default: 8080)
- `DATA_DIR`: Directory for WAL file (default: ./data)

**Command-Line Arguments:**
- `--port <port>`: Override PORT
- `--data-dir <path>`: Override DATA_DIR

### 5. Directory Structure

```
<DATA_DIR>/
└── wal.log          # Write-ahead log
```

The DATA_DIR should be created automatically if it doesn't exist.

## Testing

The test suite contains 52 tests covering:
- **CRUD operations** (14 tests): Basic get/set/delete
- **TTL/expiration** (8 tests): TTL behavior, expiration, updates
- **Persistence** (12 tests): WAL replay, crash recovery
- **Concurrency** (10 tests): Thread-safety under concurrent load
- **Batch operations** (6 tests): Multiple operations in one request
- **Prefix scanning** (2 tests): Filtering keys by prefix

### Running Tests

```bash
# Python implementation
KVSTORE_IMPL=python KVSTORE_PORT=18080 pytest tests/ -v

# TypeScript implementation
KVSTORE_IMPL=typescript KVSTORE_PORT=18081 pytest tests/ -v

# Go implementation
KVSTORE_IMPL=go KVSTORE_PORT=18082 pytest tests/ -v
```

## Success Criteria

- All 52 tests must pass (100%)
- Server must handle concurrent requests safely
- Data must persist across restarts via WAL
- TTL expiration must work correctly
