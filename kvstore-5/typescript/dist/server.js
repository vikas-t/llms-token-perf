"use strict";
/**
 * HTTP server and route handlers
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
function createServer(store, wal) {
    const app = (0, express_1.default)();
    // Parse JSON bodies
    app.use(express_1.default.json());
    /**
     * GET /stats - Get store statistics
     */
    app.get('/stats', (req, res) => {
        const stats = store.stats();
        res.json(stats);
    });
    /**
     * GET /kv - List all keys (with optional prefix filter)
     */
    app.get('/kv', (req, res) => {
        const prefix = req.query.prefix;
        const keys = store.keys(prefix);
        res.json({ keys });
    });
    /**
     * GET /kv/:key - Get value for a specific key
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
     * PUT /kv/:key - Set or update a key's value
     */
    app.put('/kv/:key', async (req, res) => {
        const key = req.params.key;
        const { value, ttl } = req.body;
        // Validate that value is provided (null is allowed, but undefined is not)
        if (!('value' in req.body)) {
            res.status(400).json({ error: 'value is required' });
            return;
        }
        try {
            // Check if key already exists
            const created = !store.has(key);
            // Log to WAL first
            await wal.logSet(key, value, ttl);
            // Then update in-memory store
            store.set(key, value, ttl);
            res.json({ key, value, created });
        }
        catch (error) {
            res.status(500).json({ error: 'failed to write to WAL' });
        }
    });
    /**
     * DELETE /kv/:key - Delete a key
     */
    app.delete('/kv/:key', async (req, res) => {
        const key = req.params.key;
        // Check if key exists first
        if (!store.has(key)) {
            res.status(404).json({ error: 'key not found' });
            return;
        }
        try {
            // Log to WAL first
            await wal.logDelete(key);
            // Then delete from in-memory store
            store.delete(key);
            res.json({ deleted: true });
        }
        catch (error) {
            res.status(500).json({ error: 'failed to write to WAL' });
        }
    });
    /**
     * POST /kv/batch - Execute multiple operations in a single request
     */
    app.post('/kv/batch', async (req, res) => {
        const { operations } = req.body;
        if (!Array.isArray(operations)) {
            res.status(400).json({ error: 'operations must be an array' });
            return;
        }
        const results = [];
        // Check for invalid operations first
        for (const operation of operations) {
            const { op } = operation;
            if (op !== 'set' && op !== 'get' && op !== 'delete') {
                res.status(400).json({ error: `invalid operation: ${op}` });
                return;
            }
        }
        // Execute operations
        for (const operation of operations) {
            const { op, key, value, ttl } = operation;
            try {
                if (op === 'set') {
                    // Log to WAL first
                    await wal.logSet(key, value, ttl);
                    store.set(key, value, ttl);
                    results.push({ success: true });
                }
                else if (op === 'get') {
                    const val = store.get(key);
                    if (val === undefined) {
                        results.push({ error: 'key not found' });
                    }
                    else {
                        results.push({ value: val });
                    }
                }
                else if (op === 'delete') {
                    if (!store.has(key)) {
                        results.push({ error: 'key not found' });
                    }
                    else {
                        // Log to WAL first
                        await wal.logDelete(key);
                        store.delete(key);
                        results.push({ success: true });
                    }
                }
            }
            catch (error) {
                results.push({ error: 'operation failed' });
            }
        }
        res.json({ success: true, results });
    });
    return app;
}
