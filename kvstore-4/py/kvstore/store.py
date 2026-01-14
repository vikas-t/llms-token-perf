"""Core KVStore implementation with thread-safe operations."""

import threading
import json
import time
from typing import Any, Optional, List, Dict, Tuple
from .utils import is_expired, calculate_expiration


# Sentinel object to distinguish "not found" from None value
_NOT_FOUND = object()


class KVStore:
    """Thread-safe in-memory key-value store with TTL support."""

    def __init__(self):
        """Initialize the store."""
        self._data: Dict[str, Any] = {}
        self._expiration: Dict[str, Optional[int]] = {}
        self._lock = threading.Lock()
        self._operation_count = 0
        self._start_time = time.time()

    def get(self, key: str) -> Tuple[bool, Any]:
        """Get value for a key.

        Args:
            key: The key to retrieve

        Returns:
            Tuple of (found: bool, value: Any). If found is False, value is undefined.
        """
        with self._lock:
            self._operation_count += 1

            # Check if key exists
            if key not in self._data:
                return (False, None)

            # Check if key has expired
            if is_expired(self._expiration.get(key)):
                # Lazy deletion
                del self._data[key]
                del self._expiration[key]
                return (False, None)

            return (True, self._data[key])

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key to a value with optional TTL.

        Args:
            key: The key to set
            value: The value to store
            ttl: Time-to-live in seconds, or None for no expiration

        Returns:
            True if key was created (new), False if updated (existing)
        """
        with self._lock:
            self._operation_count += 1
            created = key not in self._data
            self._data[key] = value
            self._expiration[key] = calculate_expiration(ttl)
            return created

    def delete(self, key: str) -> bool:
        """Delete a key.

        Args:
            key: The key to delete

        Returns:
            True if key existed and was deleted, False if key didn't exist
        """
        with self._lock:
            self._operation_count += 1

            if key not in self._data:
                return False

            # Check if key has expired (treat as already deleted)
            if is_expired(self._expiration.get(key)):
                del self._data[key]
                del self._expiration[key]
                return False

            del self._data[key]
            del self._expiration[key]
            return True

    def list_keys(self, prefix: Optional[str] = None) -> List[str]:
        """List all keys, optionally filtered by prefix.

        Args:
            prefix: Optional prefix to filter keys

        Returns:
            List of keys (excluding expired keys)
        """
        with self._lock:
            # Clean up expired keys and collect valid keys
            valid_keys = []
            expired_keys = []

            for key in self._data.keys():
                if is_expired(self._expiration.get(key)):
                    expired_keys.append(key)
                elif prefix is None or key.startswith(prefix):
                    valid_keys.append(key)

            # Lazy deletion of expired keys
            for key in expired_keys:
                del self._data[key]
                del self._expiration[key]

            return sorted(valid_keys)

    def stats(self) -> Dict[str, Any]:
        """Get store statistics.

        Returns:
            Dictionary with stats about the store
        """
        with self._lock:
            # Clean up expired keys first
            expired_keys = []
            for key in list(self._data.keys()):
                if is_expired(self._expiration.get(key)):
                    expired_keys.append(key)

            for key in expired_keys:
                del self._data[key]
                del self._expiration[key]

            # Calculate stats
            key_count = len(self._data)
            uptime = int(time.time() - self._start_time)

            return {
                "total_keys": key_count,
                "total_operations": self._operation_count,
                "uptime_seconds": uptime
            }
