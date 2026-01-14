/**
 * Write-Ahead Log for persistence
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { KVStore } from './store';
import { getCurrentTimestamp } from './utils';

interface WALOperation {
  op: 'set' | 'delete';
  key: string;
  value?: any;
  ttl?: number;
  timestamp: number;
}

export class WAL {
  private walPath: string;
  private writeStream: fsSync.WriteStream | null = null;

  constructor(private dataDir: string) {
    this.walPath = path.join(dataDir, 'wal.log');
  }

  /**
   * Initialize WAL: create directory and open write stream
   */
  async initialize(): Promise<void> {
    // Create data directory if it doesn't exist
    await fs.mkdir(this.dataDir, { recursive: true });

    // Ensure WAL file exists
    try {
      await fs.access(this.walPath);
    } catch {
      // Create empty file if it doesn't exist
      await fs.writeFile(this.walPath, '');
    }

    // Open write stream in append mode
    this.writeStream = fsSync.createWriteStream(this.walPath, { flags: 'a' });
  }

  /**
   * Log a set operation
   */
  async logSet(key: string, value: any, ttl?: number): Promise<void> {
    const operation: WALOperation = {
      op: 'set',
      key,
      value,
      timestamp: getCurrentTimestamp(),
    };

    if (ttl !== undefined) {
      operation.ttl = ttl;
    }

    await this.writeOperation(operation);
  }

  /**
   * Log a delete operation
   */
  async logDelete(key: string): Promise<void> {
    const operation: WALOperation = {
      op: 'delete',
      key,
      timestamp: getCurrentTimestamp(),
    };

    await this.writeOperation(operation);
  }

  /**
   * Write an operation to the WAL
   */
  private async writeOperation(operation: WALOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.writeStream) {
        reject(new Error('WAL not initialized'));
        return;
      }

      const line = JSON.stringify(operation) + '\n';
      this.writeStream.write(line, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Replay WAL to restore state
   */
  async replay(store: KVStore): Promise<void> {
    try {
      // Check if WAL file exists
      await fs.access(this.walPath);
    } catch {
      // WAL doesn't exist yet, nothing to replay
      return;
    }

    const content = await fs.readFile(this.walPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const operation: WALOperation = JSON.parse(line);

        if (operation.op === 'set') {
          // Calculate remaining TTL if present
          let remainingTTL: number | undefined = undefined;
          if (operation.ttl !== undefined) {
            const elapsed = getCurrentTimestamp() - operation.timestamp;
            remainingTTL = operation.ttl - elapsed;

            // Skip if already expired
            if (remainingTTL <= 0) {
              continue;
            }
          }

          store.set(operation.key, operation.value, remainingTTL);
        } else if (operation.op === 'delete') {
          store.delete(operation.key);
        }
      } catch (err) {
        console.error('Error replaying WAL operation:', err);
      }
    }
  }

  /**
   * Close the WAL
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
