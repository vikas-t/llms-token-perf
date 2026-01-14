"use strict";
/**
 * Utility functions for timestamp and expiration handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimestamp = getTimestamp;
exports.isExpired = isExpired;
exports.calculateExpiration = calculateExpiration;
/**
 * Get current Unix timestamp in seconds
 */
function getTimestamp() {
    return Math.floor(Date.now() / 1000);
}
/**
 * Check if a key has expired based on TTL
 * @param expiresAt Expiration timestamp (null means no expiration)
 * @returns true if expired, false otherwise
 */
function isExpired(expiresAt) {
    if (expiresAt === null) {
        return false;
    }
    return getTimestamp() >= expiresAt;
}
/**
 * Calculate expiration timestamp from TTL
 * @param ttl Time to live in seconds (null means no expiration)
 * @returns Unix timestamp when key expires, or null if no expiration
 */
function calculateExpiration(ttl) {
    if (ttl === null || ttl === undefined) {
        return null;
    }
    return getTimestamp() + ttl;
}
