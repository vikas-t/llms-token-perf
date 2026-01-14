/**
 * HTTP server routes and handlers
 */

import express, { Request, Response, NextFunction } from 'express';
import { KVStore } from './store';
import { WAL } from './wal';

export function createApp(store: KVStore, wal: WAL): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // GET /stats - Get store statistics
  app.get('/stats', (req: Request, res: Response) => {
    const stats = store.stats();
    res.json(stats);
  });

  // GET /kv - List all keys with optional prefix filter
  app.get('/kv', (req: Request, res: Response) => {
    const prefix = req.query.prefix as string | undefined;
    const keys = store.keys(prefix);
    res.json({ keys });
  });

  // GET /kv/:key - Get value for a key
  app.get('/kv/:key', (req: Request, res: Response) => {
    const { key } = req.params;
    const value = store.get(key);

    if (value === null) {
      res.status(404).json({ error: 'key not found' });
    } else {
      res.json({ key, value });
    }
  });

  // PUT /kv/:key - Set or update a key
  app.put('/kv/:key', async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value, ttl } = req.body;

    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    // Log to WAL first
    await wal.logSet(key, value, ttl);

    // Then apply to store
    const created = store.set(key, value, ttl);

    res.json({
      key,
      value,
      created,
    });
  });

  // DELETE /kv/:key - Delete a key
  app.delete('/kv/:key', async (req: Request, res: Response) => {
    const { key } = req.params;

    // Check if key exists
    const existed = store.get(key) !== null;

    if (!existed) {
      res.status(404).json({ error: 'key not found' });
      return;
    }

    // Log to WAL first
    await wal.logDelete(key);

    // Then delete from store
    store.delete(key);

    res.json({ deleted: true });
  });

  // POST /kv/batch - Batch operations
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
          if (key === undefined || value === undefined) {
            throw new Error('set operation requires key and value');
          }

          await wal.logSet(key, value, ttl);
          const created = store.set(key, value, ttl);
          results.push({ key, value, created });
        } else if (op === 'delete') {
          if (key === undefined) {
            throw new Error('delete operation requires key');
          }

          // For batch operations, deleting non-existent keys is not an error
          const existed = store.get(key) !== null;
          if (existed) {
            await wal.logDelete(key);
            store.delete(key);
          }
          results.push({ deleted: true });
        } else if (op === 'get') {
          if (key === undefined) {
            throw new Error('get operation requires key');
          }

          const value = store.get(key);
          if (value === null) {
            results.push({ error: 'key not found' });
          } else {
            results.push({ key, value });
          }
        } else {
          throw new Error(`invalid operation: ${op}`);
        }
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    res.json({ success: true, results });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
