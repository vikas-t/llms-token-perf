"""Helper utilities for KVStore."""
import time


def current_timestamp():
    """Get current Unix timestamp in seconds."""
    return int(time.time())


def is_expired(expiration_time):
    """Check if an expiration timestamp has passed.

    Args:
        expiration_time: Unix timestamp or None

    Returns:
        bool: True if expired, False otherwise
    """
    if expiration_time is None:
        return False
    return current_timestamp() >= expiration_time
