"""Utility functions for KVStore."""

import time


def current_timestamp():
    """Get current Unix timestamp in seconds."""
    return int(time.time())


def is_expired(expiration_time):
    """Check if a key has expired.

    Args:
        expiration_time: Unix timestamp when key expires, or None if no expiration

    Returns:
        True if key has expired, False otherwise
    """
    if expiration_time is None:
        return False
    return current_timestamp() >= expiration_time


def calculate_expiration(ttl):
    """Calculate expiration timestamp from TTL.

    Args:
        ttl: Time-to-live in seconds, or None

    Returns:
        Unix timestamp when key expires, or None if no TTL
    """
    if ttl is None:
        return None
    return current_timestamp() + ttl
