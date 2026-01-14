"use strict";
/**
 * Utility functions for the KVStore
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentTimestamp = getCurrentTimestamp;
exports.isExpired = isExpired;
exports.calculateExpiration = calculateExpiration;
/**
 * Get current Unix timestamp in seconds
 */
function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}
/**
 * Check if a key has expired based on its expiration timestamp
 * @param expiresAt - Expiration timestamp in seconds (0 means no expiration)
 * @returns true if expired, false otherwise
 */
function isExpired(expiresAt) {
    if (expiresAt === 0) {
        return false; // No expiration
    }
    return getCurrentTimestamp() >= expiresAt;
}
/**
 * Calculate expiration timestamp from TTL
 * @param ttl - Time to live in seconds (undefined/null means no expiration)
 * @returns Expiration timestamp (0 means no expiration)
 */
function calculateExpiration(ttl) {
    if (ttl === undefined || ttl === null) {
        return 0; // No expiration
    }
    if (ttl <= 0) {
        return getCurrentTimestamp(); // Already expired
    }
    return getCurrentTimestamp() + ttl;
}
