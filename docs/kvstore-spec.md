# Key-Value Store Specification

A simple HTTP-based key-value store with TTL support, persistence, and batch operations.

## API Endpoints

### Core Operations

#### GET /kv/:key
Get a value by key.

**Response:**
- `200 OK` with JSON body `{"key": "...", "value": ...}` if found
- `404 Not Found` with `{"error": "key not found"}` if missing or expired

#### PUT /kv/:key
Set a value for a key.

**Request body:**
```json
{
  "value": <any JSON value>,
  "ttl": 60  // optional, seconds until expiration
}
```

**Response:**
- `200 OK` with `{"key": "...", "value": ..., "created": true|false}`

#### DELETE /kv/:key
Delete a key.

**Response:**
- `200 OK` with `{"deleted": true}` if existed
- `404 Not Found` with `{"error": "key not found"}` if missing

#### GET /kv
List all keys (non-expired).

**Query params:**
- `prefix` (optional): Filter keys by prefix

**Response:**
- `200 OK` with `{"keys": ["key1", "key2", ...]}`

### Batch Operations

#### POST /kv/batch
Perform multiple operations atomically.

**Request body:**
```json
{
  "operations": [
    {"op": "set", "key": "k1", "value": "v1", "ttl": 60},
    {"op": "set", "key": "k2", "value": "v2"},
    {"op": "delete", "key": "k3"}
  ]
}
```

**Response:**
- `200 OK` with `{"success": true, "results": [...]}`

### Stats

#### GET /stats
Get store statistics.

**Response:**
```json
{
  "total_keys": 100,
  "total_operations": 5000,
  "uptime_seconds": 3600
}
```

## Persistence

The store must persist data to disk using a write-ahead log (WAL):
- All mutations are logged before being applied
- On startup, replay the log to restore state
- Log file: `data/wal.log`

## TTL/Expiration

- Keys with TTL expire after the specified seconds
- Expired keys are not returned by GET
- Expired keys are not included in list operations
- Expired keys may be lazily cleaned up

## Concurrency

- The store must be safe for concurrent access
- Use appropriate locking mechanisms

## Configuration

The server should:
- Listen on port from `PORT` env var (default: 8080)
- Store data in `DATA_DIR` env var (default: `./data`)

## Error Handling

All errors return JSON:
```json
{"error": "description of what went wrong"}
```

HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid JSON, missing fields)
- `404` - Key not found
- `500` - Internal server error
