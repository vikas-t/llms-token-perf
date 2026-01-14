/**
 * Core KVStore class with in-memory storage and TTL support
 */

import { isExpired, calculateExpiration } from './utils';

interface StoreEntry {
  value: any;
  expiresAt: number | null;
}

export class KVStore {
  private data: Map<string, StoreEntry>;
  private operationCount: number;
  private startTime: number;

  constructor() {
    this.data = new Map();
    this.operationCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Get a value by key
   */
  get(key: string): any | null {
    this.operationCount++;
    const entry = this.data.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired (lazy deletion)
    if (isExpired(entry.expiresAt)) {
      this.data.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a key-value pair with optional TTL
   * Returns true if key was created, false if updated
   */
  set(key: string, value: any, ttl?: number): boolean {
    this.operationCount++;
    const existed = this.data.has(key);

    let expiresAt: number | null = null;
    if (ttl !== undefined) {
      expiresAt = calculateExpiration(ttl);
    }

    this.data.set(key, { value, expiresAt });
    return !existed;
  }

  /**
   * Delete a key
   * Returns true if key existed, false otherwise
   */
  delete(key: string): boolean {
    this.operationCount++;
    // Check if exists and not expired (but don't count the get operation twice)
    this.operationCount--;
    if (this.get(key) === null) {
      return false;
    }
    return this.data.delete(key);
  }

  /**
   * List all keys, optionally filtered by prefix
   */
  keys(prefix?: string): string[] {
    const keys: string[] = [];

    for (const [key, entry] of this.data.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.data.delete(key);
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
  stats(): { total_keys: number; total_operations: number; uptime_seconds: number } {
    let totalKeys = 0;

    for (const [key, entry] of this.data.entries()) {
      // Skip expired keys
      if (isExpired(entry.expiresAt)) {
        this.data.delete(key);
        continue;
      }

      totalKeys++;
    }

    const uptimeSeconds = (Date.now() - this.startTime) / 1000;

    return {
      total_keys: totalKeys,
      total_operations: this.operationCount,
      uptime_seconds: uptimeSeconds,
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.data.clear();
  }
}
