/**
 * Core KVStore class for in-memory storage with TTL support
 */

import { isExpired, calculateExpiration } from './utils';

interface StoreEntry {
  value: any;
  expiresAt: number | null;
}

export class KVStore {
  private store: Map<string, StoreEntry>;

  constructor() {
    this.store = new Map();
  }

  /**
   * Set a key-value pair with optional TTL
   * @param key The key to set
   * @param value The value to store
   * @param ttl Time to live in seconds (optional)
   */
  set(key: string, value: any, ttl?: number): void {
    const expiresAt = calculateExpiration(ttl ?? null);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Get a value by key
   * @param key The key to retrieve
   * @returns The value if found and not expired, undefined otherwise
   */
  get(key: string): any | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired (lazy deletion)
    if (isExpired(entry.expiresAt)) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Delete a key
   * @param key The key to delete
   * @returns true if key existed, false otherwise
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Check if a key exists (and is not expired)
   * @param key The key to check
   * @returns true if key exists and not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Get all keys, optionally filtered by prefix
   * @param prefix Optional prefix to filter keys
   * @returns Array of keys (excluding expired ones)
   */
  keys(prefix?: string): string[] {
    const allKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.store.delete(key);
        continue;
      }

      // Filter by prefix if provided
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }

      allKeys.push(key);
    }

    return allKeys;
  }

  /**
   * Get store statistics
   * @returns Object with keys count and total size in bytes
   */
  stats(): { keys: number; size_bytes: number } {
    let keys = 0;
    let size_bytes = 0;

    for (const [key, entry] of this.store.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.store.delete(key);
        continue;
      }

      keys++;
      // Calculate size: key size + JSON-serialized value size
      size_bytes += Buffer.byteLength(key, 'utf8');
      size_bytes += Buffer.byteLength(JSON.stringify(entry.value), 'utf8');
    }

    return { keys, size_bytes };
  }

  /**
   * Clear all entries (used for testing/reset)
   */
  clear(): void {
    this.store.clear();
  }
}
