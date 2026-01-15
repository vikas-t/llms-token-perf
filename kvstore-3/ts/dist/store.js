"use strict";
/**
 * Core KVStore class for in-memory storage with TTL support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KVStore = void 0;
const utils_1 = require("./utils");
class KVStore {
    constructor() {
        this.data = new Map();
    }
    /**
     * Get value for a key, returns undefined if not found or expired
     */
    get(key) {
        const entry = this.data.get(key);
        if (!entry) {
            return undefined;
        }
        // Check if expired
        if ((0, utils_1.isExpired)(entry.expiresAt)) {
            this.data.delete(key); // Lazy cleanup
            return undefined;
        }
        return entry.value;
    }
    /**
     * Set a key-value pair with optional expiration timestamp
     * Returns true if key was created (new), false if updated (existing)
     */
    set(key, value, expiresAt = null) {
        const existed = this.data.has(key);
        this.data.set(key, { value, expiresAt });
        return !existed; // Return true if created (new key)
    }
    /**
     * Delete a key, returns true if key existed, false otherwise
     */
    delete(key) {
        return this.data.delete(key);
    }
    /**
     * List all keys, with optional prefix filter
     * Excludes expired keys
     */
    listKeys(prefix) {
        const keys = [];
        for (const [key, entry] of this.data.entries()) {
            // Skip expired keys
            if ((0, utils_1.isExpired)(entry.expiresAt)) {
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
    getStats() {
        let keys = 0;
        let sizeBytes = 0;
        for (const [key, entry] of this.data.entries()) {
            // Skip expired keys
            if ((0, utils_1.isExpired)(entry.expiresAt)) {
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
    clear() {
        this.data.clear();
    }
}
exports.KVStore = KVStore;
