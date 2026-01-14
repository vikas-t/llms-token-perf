/**
 * Write-Ahead Log implementation for persistence
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { KVStore } from './store';
import { getTimestamp } from './utils';

interface WALOperation {
  op: 'set' | 'delete';
  key: string;
  value?: any;
  ttl?: number;
  timestamp: number;
}

export class WAL {
  private filePath: string;
  private fileHandle: fs.FileHandle | null = null;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'wal.log');
  }

  /**
   * Initialize the WAL (open file, create directory if needed)
   */
  async init(): Promise<void> {
    // Create data directory if it doesn't exist
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    // Open file in append mode
    this.fileHandle = await fs.open(this.filePath, 'a');
  }

  /**
   * Log a set operation
   */
  async logSet(key: string, value: any, ttl?: number): Promise<void> {
    const operation: WALOperation = {
      op: 'set',
      key,
      value,
      ttl,
      timestamp: getTimestamp(),
    };
    await this.writeOperation(operation);
  }

  /**
   * Log a delete operation
   */
  async logDelete(key: string): Promise<void> {
    const operation: WALOperation = {
      op: 'delete',
      key,
      timestamp: getTimestamp(),
    };
    await this.writeOperation(operation);
  }

  /**
   * Write an operation to the log file
   */
  private async writeOperation(operation: WALOperation): Promise<void> {
    if (!this.fileHandle) {
      throw new Error('WAL not initialized');
    }

    const line = JSON.stringify(operation) + '\n';
    await this.fileHandle.write(line);
    // Ensure data is written to disk
    await this.fileHandle.datasync();
  }

  /**
   * Replay the WAL to restore state
   * @param store The KVStore instance to restore into
   */
  async replay(store: KVStore): Promise<void> {
    // Check if WAL file exists
    try {
      await fs.access(this.filePath);
    } catch {
      // File doesn't exist, nothing to replay
      return;
    }

    // Read and replay each line
    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');

    for (const line of lines) {
      try {
        const operation: WALOperation = JSON.parse(line);

        if (operation.op === 'set') {
          // Calculate remaining TTL based on original timestamp
          let ttl: number | undefined = undefined;
          if (operation.ttl !== undefined) {
            const elapsed = getTimestamp() - operation.timestamp;
            const remaining = operation.ttl - elapsed;
            // Only set if not already expired
            if (remaining > 0) {
              ttl = remaining;
            } else {
              // Skip expired entries during replay
              continue;
            }
          }
          store.set(operation.key, operation.value, ttl);
        } else if (operation.op === 'delete') {
          store.delete(operation.key);
        }
      } catch (error) {
        // Skip malformed lines
        console.error(`Error replaying WAL line: ${line}`, error);
      }
    }
  }

  /**
   * Close the WAL file
   */
  async close(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }
}
