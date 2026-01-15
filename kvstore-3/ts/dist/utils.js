"use strict";
/**
 * Utility functions for timestamp and expiration handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentTimestamp = getCurrentTimestamp;
exports.isExpired = isExpired;
exports.calculateExpiresAt = calculateExpiresAt;
/**
 * Get current timestamp in seconds
 */
function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}
/**
 * Check if a key has expired based on its expiration timestamp
 */
function isExpired(expiresAt) {
    if (expiresAt === null) {
        return false;
    }
    return getCurrentTimestamp() >= expiresAt;
}
/**
 * Calculate expiration timestamp from TTL
 */
function calculateExpiresAt(ttl) {
    if (ttl === null || ttl === undefined) {
        return null;
    }
    return getCurrentTimestamp() + ttl;
}
