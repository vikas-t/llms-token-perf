/**
 * HTTP server for the KVStore API.
 */

import express, { Request, Response, Router } from "express";
import { KVStore, NOT_FOUND } from "./store";
import { WAL } from "./wal";

export function createApp(store: KVStore, wal: WAL, startTime: number): express.Application {
  const app = express();
  app.use(express.json());

  // GET /stats
  app.get("/stats", (_req: Request, res: Response) => {
    const uptime = (Date.now() - startTime) / 1000;
    res.json({
      total_keys: store.countKeys(),
      total_operations: store.getTotalOperations(),
      uptime_seconds: uptime,
    });
  });

  // GET /kv - list keys
  app.get("/kv", (req: Request, res: Response) => {
    const prefix = req.query.prefix as string | undefined;
    const keys = store.listKeys(prefix);
    res.json({ keys });
  });

  // POST /kv/batch - batch operations (must come before /kv/:key)
  app.post("/kv/batch", (req: Request, res: Response) => {
    const operations = req.body.operations || [];
    const results: Array<{ key: string; created?: boolean; deleted?: boolean }> = [];

    for (const opData of operations) {
      const op = opData.op;
      const key = opData.key;

      if (op === "set") {
        const value = opData.value;
        const ttl = opData.ttl;

        let expiry: number | null = null;
        if (ttl !== undefined) {
          if (ttl <= 0) {
            expiry = Date.now();
          } else {
            expiry = Date.now() + ttl * 1000;
          }
        }

        const created = store.set(key, value, ttl);
        wal.append("set", key, value, expiry);
        results.push({ key, created });
      } else if (op === "delete") {
        const deleted = store.delete(key);
        if (deleted) {
          wal.append("delete", key);
        }
        results.push({ key, deleted });
      } else {
        res.status(400).json({ error: `Invalid operation: ${op}` });
        return;
      }
    }

    res.json({ success: true, results });
  });

  // GET /kv/:key - get value
  app.get("/kv/:key", (req: Request, res: Response) => {
    const key = req.params.key as string;
    const value = store.get(key);

    if (value === NOT_FOUND) {
      res.status(404).json({ error: "Key not found" });
    } else {
      res.json({ key, value });
    }
  });

  // PUT /kv/:key - set value
  app.put("/kv/:key", (req: Request, res: Response) => {
    const key = req.params.key as string;
    const value = req.body.value;
    const ttl = req.body.ttl;

    let expiry: number | null = null;
    if (ttl !== undefined) {
      if (ttl <= 0) {
        expiry = Date.now();
      } else {
        expiry = Date.now() + ttl * 1000;
      }
    }

    const created = store.set(key, value, ttl);
    wal.append("set", key, value, expiry);

    res.json({ key, value, created });
  });

  // DELETE /kv/:key - delete key
  app.delete("/kv/:key", (req: Request, res: Response) => {
    const key = req.params.key as string;
    const deleted = store.delete(key);

    if (deleted) {
      wal.append("delete", key);
      res.json({ deleted: true });
    } else {
      res.status(404).json({ error: "Key not found" });
    }
  });

  return app;
}

export function createServer(port: number, dataDir: string): { start: () => void } {
  const store = new KVStore();
  const wal = new WAL(dataDir);

  // Replay WAL to restore state
  wal.replay(
    (key, value, expiry) => store.restore(key, value, expiry),
    (key) => store.removeForRestore(key)
  );

  const startTime = Date.now();
  const app = createApp(store, wal, startTime);

  return {
    start: () => {
      app.listen(port, () => {
        // Server started silently
      });
    },
  };
}
