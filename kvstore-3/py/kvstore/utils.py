"""Helper utilities for KVStore."""

import time


def get_current_timestamp() -> int:
    """Get current Unix timestamp in seconds."""
    return int(time.time())


def is_expired(expiration_time: int) -> bool:
    """Check if a key has expired based on expiration timestamp.

    Args:
        expiration_time: Unix timestamp when the key expires

    Returns:
        True if the key has expired, False otherwise
    """
    return get_current_timestamp() >= expiration_time


def calculate_expiration(ttl: int) -> int:
    """Calculate expiration timestamp from TTL.

    Args:
        ttl: Time-to-live in seconds

    Returns:
        Unix timestamp when the key will expire
    """
    return get_current_timestamp() + ttl
