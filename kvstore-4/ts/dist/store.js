"use strict";
/**
 * Core KVStore class with in-memory storage and TTL support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KVStore = void 0;
const utils_1 = require("./utils");
class KVStore {
    constructor() {
        this.store = new Map();
    }
    /**
     * Set a key-value pair with optional TTL
     * @returns true if key was created, false if updated
     */
    set(key, value, ttl) {
        const existed = this.store.has(key) && !this.isExpired(key);
        const expiresAt = (0, utils_1.calculateExpiration)(ttl);
        this.store.set(key, { value, expiresAt });
        return !existed; // Return true if created, false if updated
    }
    /**
     * Get a value by key
     * @returns value if found and not expired, undefined otherwise
     */
    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return undefined;
        }
        if ((0, utils_1.isExpired)(entry.expiresAt)) {
            // Lazy deletion: remove expired key
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    /**
     * Check if a key exists and is not expired
     */
    has(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return false;
        }
        if ((0, utils_1.isExpired)(entry.expiresAt)) {
            // Lazy deletion: remove expired key
            this.store.delete(key);
            return false;
        }
        return true;
    }
    /**
     * Delete a key
     * @returns true if key existed and was deleted, false otherwise
     */
    delete(key) {
        if (!this.has(key)) {
            return false;
        }
        this.store.delete(key);
        return true;
    }
    /**
     * List all keys, optionally filtered by prefix
     * Excludes expired keys
     */
    listKeys(prefix) {
        const keys = [];
        for (const [key, entry] of this.store.entries()) {
            // Skip expired keys
            if ((0, utils_1.isExpired)(entry.expiresAt)) {
                this.store.delete(key); // Lazy deletion
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
    getStats() {
        let keys = 0;
        let size_bytes = 0;
        for (const [key, entry] of this.store.entries()) {
            // Skip expired keys
            if ((0, utils_1.isExpired)(entry.expiresAt)) {
                this.store.delete(key); // Lazy deletion
                continue;
            }
            keys++;
            // Calculate size in bytes
            const valueStr = JSON.stringify(entry.value);
            size_bytes += Buffer.byteLength(key, 'utf-8') + Buffer.byteLength(valueStr, 'utf-8');
        }
        return { keys, size_bytes };
    }
    /**
     * Check if a key is expired (for internal use)
     */
    isExpired(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return false;
        }
        return (0, utils_1.isExpired)(entry.expiresAt);
    }
}
exports.KVStore = KVStore;
