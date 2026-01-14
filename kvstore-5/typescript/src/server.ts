/**
 * HTTP server and route handlers
 */

import express, { Request, Response, Application } from 'express';
import { KVStore } from './store';
import { WAL } from './wal';

export function createServer(store: KVStore, wal: WAL): Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  /**
   * GET /stats - Get store statistics
   */
  app.get('/stats', (req: Request, res: Response) => {
    const stats = store.stats();
    res.json(stats);
  });

  /**
   * GET /kv - List all keys (with optional prefix filter)
   */
  app.get('/kv', (req: Request, res: Response) => {
    const prefix = req.query.prefix as string | undefined;
    const keys = store.keys(prefix);
    res.json({ keys });
  });

  /**
   * GET /kv/:key - Get value for a specific key
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
   * PUT /kv/:key - Set or update a key's value
   */
  app.put('/kv/:key', async (req: Request, res: Response) => {
    const key = req.params.key;
    const { value, ttl } = req.body;

    // Validate that value is provided (null is allowed, but undefined is not)
    if (!('value' in req.body)) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    try {
      // Log to WAL first
      await wal.logSet(key, value, ttl);

      // Then update in-memory store
      store.set(key, value, ttl);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'failed to write to WAL' });
    }
  });

  /**
   * DELETE /kv/:key - Delete a key
   */
  app.delete('/kv/:key', async (req: Request, res: Response) => {
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
    } catch (error) {
      res.status(500).json({ error: 'failed to write to WAL' });
    }
  });

  /**
   * POST /kv/batch - Execute multiple operations in a single request
   */
  app.post('/kv/batch', async (req: Request, res: Response) => {
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      res.status(400).json({ error: 'operations must be an array' });
      return;
    }

    const results: any[] = [];

    for (const operation of operations) {
      const { op, key, value, ttl } = operation;

      try {
        if (op === 'set') {
          // Log to WAL first
          await wal.logSet(key, value, ttl);
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
          if (!store.has(key)) {
            results.push({ error: 'key not found' });
          } else {
            // Log to WAL first
            await wal.logDelete(key);
            store.delete(key);
            results.push({ success: true });
          }
        } else {
          results.push({ error: `unknown operation: ${op}` });
        }
      } catch (error) {
        results.push({ error: 'operation failed' });
      }
    }

    res.json({ results });
  });

  return app;
}
