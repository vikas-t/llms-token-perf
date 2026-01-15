/**
 * Core KVStore class for in-memory storage with TTL support
 */

import { isExpired } from './utils';

interface StoreEntry {
  value: any;
  expiresAt: number | null;
}

export class KVStore {
  private data: Map<string, StoreEntry>;

  constructor() {
    this.data = new Map();
  }

  /**
   * Get value for a key, returns undefined if not found or expired
   */
  get(key: string): any | undefined {
    const entry = this.data.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (isExpired(entry.expiresAt)) {
      this.data.delete(key); // Lazy cleanup
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a key-value pair with optional expiration timestamp
   * Returns true if key was created (new), false if updated (existing)
   */
  set(key: string, value: any, expiresAt: number | null = null): boolean {
    const existed = this.data.has(key);
    this.data.set(key, { value, expiresAt });
    return !existed; // Return true if created (new key)
  }

  /**
   * Delete a key, returns true if key existed, false otherwise
   */
  delete(key: string): boolean {
    return this.data.delete(key);
  }

  /**
   * List all keys, with optional prefix filter
   * Excludes expired keys
   */
  listKeys(prefix?: string): string[] {
    const keys: string[] = [];

    for (const [key, entry] of this.data.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.data.delete(key); // Lazy cleanup
        continue;
      }

      // Apply prefix filter if provided
      if (prefix === undefined || key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Get statistics about the store
   */
  getStats(): { keys: number; size_bytes: number } {
    let keys = 0;
    let sizeBytes = 0;

    for (const [key, entry] of this.data.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.data.delete(key); // Lazy cleanup
        continue;
      }

      keys++;
      // Calculate size in bytes (JSON representation)
      const valueStr = JSON.stringify(entry.value);
      sizeBytes += valueStr.length;
    }

    return { keys, size_bytes: sizeBytes };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.data.clear();
  }
}
