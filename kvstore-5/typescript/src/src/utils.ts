/**
 * Utility functions for the KVStore
 */

/**
 * Get current Unix timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a key has expired based on its expiration timestamp
 */
export function isExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) {
    return false;
  }
  return getCurrentTimestamp() >= expiresAt;
}

/**
 * Calculate expiration timestamp from TTL
 */
export function calculateExpiration(ttl: number): number {
  return getCurrentTimestamp() + ttl;
}
