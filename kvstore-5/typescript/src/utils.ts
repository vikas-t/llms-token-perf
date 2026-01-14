/**
 * Utility functions for timestamp and expiration handling
 */

/**
 * Get current Unix timestamp in seconds
 */
export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a key has expired based on TTL
 * @param expiresAt Expiration timestamp (null means no expiration)
 * @returns true if expired, false otherwise
 */
export function isExpired(expiresAt: number | null): boolean {
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
export function calculateExpiration(ttl: number | null): number | null {
  if (ttl === null || ttl === undefined) {
    return null;
  }
  return getTimestamp() + ttl;
}
