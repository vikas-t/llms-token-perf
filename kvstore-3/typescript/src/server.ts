/**
 * HTTP server routes and handlers
 */

import express, { Request, Response } from 'express';
import { KVStore } from './store';
import { WAL } from './wal';
import { calculateExpiresAt } from './utils';

export function createServer(store: KVStore, wal: WAL): express.Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  /**
   * GET /stats - Get store statistics
   */
  app.get('/stats', (req: Request, res: Response) => {
    const stats = store.getStats();
    res.json(stats);
  });

  /**
   * GET /kv - List all keys with optional prefix filter
   */
  app.get('/kv', (req: Request, res: Response) => {
    const prefix = req.query.prefix as string | undefined;
    const keys = store.listKeys(prefix);
    res.json({ keys });
  });

  /**
   * GET /kv/:key - Get value for a key
   */
  app.get('/kv/:key', (req: Request, res: Response) => {
    const key = req.params.key;
    const value = store.get(key);

    if (value === undefined) {
      res.status(404).json({ error: 'key not found' });
    } else {
      res.json({ key, value });
    }
  });

  /**
   * PUT /kv/:key - Set or update a key
   */
  app.put('/kv/:key', async (req: Request, res: Response) => {
    const key = req.params.key;
    const { value, ttl } = req.body;

    // Calculate expiration timestamp
    const expiresAt = calculateExpiresAt(ttl);

    // Log to WAL first
    await wal.logSet(key, value, expiresAt);

    // Then update in-memory store
    const created = store.set(key, value, expiresAt);

    res.json({ key, value, created });
  });

  /**
   * DELETE /kv/:key - Delete a key
   */
  app.delete('/kv/:key', async (req: Request, res: Response) => {
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
  app.post('/kv/batch', async (req: Request, res: Response) => {
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      res.status(400).json({ error: 'operations must be an array' });
      return;
    }

    const results: any[] = [];

    for (const op of operations) {
      try {
        if (op.op === 'set') {
          const expiresAt = calculateExpiresAt(op.ttl);
          await wal.logSet(op.key, op.value, expiresAt);
          store.set(op.key, op.value, expiresAt);
          results.push({ success: true });
        } else if (op.op === 'get') {
          const value = store.get(op.key);
          if (value === undefined) {
            results.push({ error: 'key not found' });
          } else {
            results.push({ value });
          }
        } else if (op.op === 'delete') {
          const exists = store.get(op.key) !== undefined;
          if (!exists) {
            results.push({ error: 'key not found' });
          } else {
            await wal.logDelete(op.key);
            store.delete(op.key);
            results.push({ success: true });
          }
        } else {
          results.push({ error: 'unknown operation' });
        }
      } catch (err) {
        results.push({ error: 'operation failed' });
      }
    }

    res.json({ results });
  });

  return app;
}
