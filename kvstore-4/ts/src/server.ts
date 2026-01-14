/**
 * HTTP server routes and handlers
 */

import express, { Request, Response } from 'express';
import { KVStore } from './store';
import { WAL } from './wal';

export function createApp(store: KVStore, wal: WAL): express.Application {
  const app = express();
  app.use(express.json());

  // GET /stats - Get store statistics
  app.get('/stats', (req: Request, res: Response) => {
    const stats = store.getStats();
    res.json(stats);
  });

  // GET /kv - List all keys with optional prefix filter
  app.get('/kv', (req: Request, res: Response) => {
    const prefix = req.query.prefix as string | undefined;
    const keys = store.listKeys(prefix);
    res.json({ keys });
  });

  // GET /kv/:key - Get a specific key
  app.get('/kv/:key', (req: Request, res: Response) => {
    const { key } = req.params;
    const value = store.get(key);

    if (value === undefined) {
      res.status(404).json({ error: 'key not found' });
      return;
    }

    res.json({ key, value });
  });

  // PUT /kv/:key - Set or update a key
  app.put('/kv/:key', async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value, ttl } = req.body;

    // Write to WAL first
    await wal.append('set', key, value, ttl);

    // Then update in-memory store
    const created = store.set(key, value, ttl);

    res.json({ key, value, created });
  });

  // DELETE /kv/:key - Delete a key
  app.delete('/kv/:key', async (req: Request, res: Response) => {
    const { key } = req.params;

    const existed = store.has(key);

    if (!existed) {
      res.status(404).json({ error: 'key not found' });
      return;
    }

    // Write to WAL first
    await wal.append('delete', key);

    // Then delete from in-memory store
    store.delete(key);

    res.json({ deleted: true });
  });

  // POST /kv/batch - Execute multiple operations
  app.post('/kv/batch', async (req: Request, res: Response) => {
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      res.status(400).json({ error: 'operations must be an array' });
      return;
    }

    const results: any[] = [];

    for (const operation of operations) {
      const { op, key, value, ttl } = operation;

      if (op === 'set') {
        // Write to WAL
        await wal.append('set', key, value, ttl);
        // Update store
        store.set(key, value, ttl);
        results.push({ success: true });
      } else if (op === 'get') {
        const val = store.get(key);
        if (val === undefined) {
          results.push({ error: 'key not found' });
        } else {
          results.push({ value: val });
        }
      } else if (op === 'delete') {
        const existed = store.has(key);
        if (existed) {
          // Write to WAL
          await wal.append('delete', key);
          // Delete from store
          store.delete(key);
          results.push({ success: true });
        } else {
          results.push({ success: true }); // Delete is idempotent
        }
      } else {
        results.push({ error: `unknown operation: ${op}` });
      }
    }

    res.json({ results });
  });

  return app;
}
