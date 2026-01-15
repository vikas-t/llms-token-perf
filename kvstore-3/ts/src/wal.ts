/**
 * Write-Ahead Log implementation for persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { KVStore } from './store';
import { getCurrentTimestamp } from './utils';

interface WALEntry {
  op: 'set' | 'delete';
  key: string;
  value?: any;
  expiresAt?: number | null;
  timestamp: number;
}

export class WAL {
  private filePath: string;

  constructor(dataDir: string) {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.filePath = path.join(dataDir, 'wal.log');
  }

  /**
   * Open WAL file for writing (append mode)
   */
  open(): void {
    // Create the file if it doesn't exist
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '');
    }
  }

  /**
   * Close WAL file
   */
  close(): void {
    // Nothing to do for sync writes
  }

  /**
   * Log a set operation
   */
  async logSet(key: string, value: any, expiresAt: number | null): Promise<void> {
    const entry: WALEntry = {
      op: 'set',
      key,
      value,
      expiresAt,
      timestamp: getCurrentTimestamp(),
    };
    await this.writeEntry(entry);
  }

  /**
   * Log a delete operation
   */
  async logDelete(key: string): Promise<void> {
    const entry: WALEntry = {
      op: 'delete',
      key,
      timestamp: getCurrentTimestamp(),
    };
    await this.writeEntry(entry);
  }

  /**
   * Write an entry to the WAL using synchronous append
   */
  private async writeEntry(entry: WALEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');
  }

  /**
   * Replay WAL to restore store state
   */
  async replay(store: KVStore): Promise<void> {
    if (!fs.existsSync(this.filePath)) {
      return; // No WAL file exists yet
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }

      try {
        const entry: WALEntry = JSON.parse(line);

        if (entry.op === 'set') {
          store.set(entry.key, entry.value, entry.expiresAt || null);
        } else if (entry.op === 'delete') {
          store.delete(entry.key);
        }
      } catch (err) {
        console.error('Failed to parse WAL entry:', line, err);
      }
    }
  }
}
