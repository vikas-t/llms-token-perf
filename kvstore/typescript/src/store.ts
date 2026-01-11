/**
 * Core key-value store with TTL support.
 */

// Sentinel for "key not found"
export const NOT_FOUND = Symbol("NOT_FOUND");

interface Entry {
  value: unknown;
  expiry: number | null; // Unix timestamp in ms, null = no expiry
}

export class KVStore {
  private data: Map<string, Entry> = new Map();
  private totalOperations: number = 0;

  get(key: string): unknown | typeof NOT_FOUND {
    this.totalOperations++;
    const entry = this.data.get(key);
    if (!entry) {
      return NOT_FOUND;
    }
    if (entry.expiry !== null && Date.now() >= entry.expiry) {
      this.data.delete(key);
      return NOT_FOUND;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttl?: number): boolean {
    this.totalOperations++;
    const created = !this.data.has(key) || this.isExpired(key);

    let expiry: number | null = null;
    if (ttl !== undefined) {
      if (ttl <= 0) {
        expiry = Date.now();
      } else {
        expiry = Date.now() + ttl * 1000;
      }
    }

    this.data.set(key, { value, expiry });
    return created;
  }

  delete(key: string): boolean {
    this.totalOperations++;
    const entry = this.data.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(key)) {
      this.data.delete(key);
      return false;
    }
    this.data.delete(key);
    return true;
  }

  listKeys(prefix?: string): string[] {
    this.totalOperations++;
    const result: string[] = [];
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.data) {
      if (entry.expiry !== null && Date.now() >= entry.expiry) {
        expiredKeys.push(key);
        continue;
      }
      if (prefix === undefined || prefix === null || key.startsWith(prefix)) {
        result.push(key);
      }
    }

    // Clean up expired keys
    for (const key of expiredKeys) {
      this.data.delete(key);
    }

    return result;
  }

  countKeys(): number {
    let count = 0;
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.data) {
      if (entry.expiry !== null && Date.now() >= entry.expiry) {
        expiredKeys.push(key);
      } else {
        count++;
      }
    }

    // Clean up expired keys
    for (const key of expiredKeys) {
      this.data.delete(key);
    }

    return count;
  }

  getTotalOperations(): number {
    return this.totalOperations;
  }

  private isExpired(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry) {
      return true;
    }
    return entry.expiry !== null && Date.now() >= entry.expiry;
  }

  // Restore methods for WAL replay (don't increment operations)
  restore(key: string, value: unknown, expiry: number | null): void {
    this.data.set(key, { value, expiry });
  }

  removeForRestore(key: string): void {
    this.data.delete(key);
  }
}
