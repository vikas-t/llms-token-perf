/**
 * Utility functions for timestamp and expiration handling
 */

/**
 * Get current timestamp in seconds
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
export function calculateExpiresAt(ttl: number | null): number | null {
  if (ttl === null || ttl === undefined) {
    return null;
  }
  return getCurrentTimestamp() + ttl;
}
