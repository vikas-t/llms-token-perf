/**
 * Write-Ahead Log (WAL) implementation for persistence
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getCurrentTimestamp } from './utils';

export interface WALOperation {
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
   * Initialize the WAL file
   */
  async init(): Promise<void> {
    // Ensure the directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    // Open file in append mode
    this.fileHandle = await fs.open(this.filePath, 'a');
  }

  /**
   * Append an operation to the WAL
   */
  async append(op: 'set' | 'delete', key: string, value?: any, ttl?: number): Promise<void> {
    const operation: WALOperation = {
      op,
      key,
      timestamp: getCurrentTimestamp(),
    };

    if (op === 'set') {
      operation.value = value;
      if (ttl !== undefined && ttl !== null) {
        operation.ttl = ttl;
      }
    }

    const line = JSON.stringify(operation) + '\n';

    if (this.fileHandle) {
      await this.fileHandle.write(line);
      // Flush to disk to ensure durability
      await this.fileHandle.datasync();
    }
  }

  /**
   * Replay the WAL and return all operations
   */
  async replay(): Promise<WALOperation[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return [];
      }
      throw err;
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
