"use strict";
/**
 * HTTP server routes and handlers
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const utils_1 = require("./utils");
function createServer(store, wal) {
    const app = (0, express_1.default)();
    // Parse JSON bodies
    app.use(express_1.default.json());
    /**
     * GET /stats - Get store statistics
     */
    app.get('/stats', (req, res) => {
        const stats = store.getStats();
        res.json(stats);
    });
    /**
     * GET /kv - List all keys with optional prefix filter
     */
    app.get('/kv', (req, res) => {
        const prefix = req.query.prefix;
        const keys = store.listKeys(prefix);
        res.json({ keys });
    });
    /**
     * GET /kv/:key - Get value for a key
     */
    app.get('/kv/:key', (req, res) => {
        const key = req.params.key;
        const value = store.get(key);
        if (value === undefined) {
            res.status(404).json({ error: 'key not found' });
        }
        else {
            res.json({ key, value });
        }
    });
    /**
     * PUT /kv/:key - Set or update a key
     */
    app.put('/kv/:key', async (req, res) => {
        const key = req.params.key;
        const { value, ttl } = req.body;
        // Calculate expiration timestamp
        const expiresAt = (0, utils_1.calculateExpiresAt)(ttl);
        // Log to WAL first
        await wal.logSet(key, value, expiresAt);
        // Then update in-memory store
        const created = store.set(key, value, expiresAt);
        res.json({ key, value, created });
    });
    /**
     * DELETE /kv/:key - Delete a key
     */
    app.delete('/kv/:key', async (req, res) => {
        const key = req.params.key;
        // Check if key exists
        const exists = store.get(key) !== undefined;
        if (!exists) {
            res.status(404).json({ error: 'key not found' });
            return;
        }
        // Log to WAL first
        await wal.logDelete(key);
        // Then delete from in-memory store
        store.delete(key);
        res.json({ deleted: true });
    });
    /**
     * POST /kv/batch - Execute multiple operations
     */
    app.post('/kv/batch', async (req, res) => {
        const { operations } = req.body;
        if (!Array.isArray(operations)) {
            res.status(400).json({ error: 'operations must be an array' });
            return;
        }
        const results = [];
        for (const op of operations) {
            try {
                if (op.op === 'set') {
                    const expiresAt = (0, utils_1.calculateExpiresAt)(op.ttl);
                    await wal.logSet(op.key, op.value, expiresAt);
                    store.set(op.key, op.value, expiresAt);
                    results.push({ success: true });
                }
                else if (op.op === 'get') {
                    const value = store.get(op.key);
                    if (value === undefined) {
                        results.push({ error: 'key not found' });
                    }
                    else {
                        results.push({ value });
                    }
                }
                else if (op.op === 'delete') {
                    const exists = store.get(op.key) !== undefined;
                    if (!exists) {
                        results.push({ error: 'key not found' });
                    }
                    else {
                        await wal.logDelete(op.key);
                        store.delete(op.key);
                        results.push({ success: true });
                    }
                }
                else {
                    results.push({ error: 'unknown operation' });
                }
            }
            catch (err) {
                results.push({ error: 'operation failed' });
            }
        }
        res.json({ results });
    });
    return app;
}
