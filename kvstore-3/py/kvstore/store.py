"""Core KVStore implementation with in-memory storage and TTL support."""

import threading
import time
from typing import Any, Optional, List, Dict, Tuple
from .utils import is_expired, calculate_expiration, get_current_timestamp


class KVStore:
    """Thread-safe key-value store with TTL support.

    Provides in-memory storage with optional time-to-live for keys.
    Uses lazy expiration (checks on access).
    """

    def __init__(self):
        """Initialize the store."""
        self._data: Dict[str, Any] = {}
        self._expiration: Dict[str, int] = {}
        self._lock = threading.Lock()
        self._operation_count = 0
        self._start_time = time.time()

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key-value pair with optional TTL.

        Args:
            key: The key to set
            value: The value to store (can be any JSON-serializable type)
            ttl: Time-to-live in seconds (None means no expiration)

        Returns:
            True if the key was newly created, False if it was updated
        """
        with self._lock:
            created = key not in self._data
            self._data[key] = value
            if ttl is not None:
                self._expiration[key] = calculate_expiration(ttl)
            elif key in self._expiration:
                del self._expiration[key]
            self._operation_count += 1
            return created

    def get(self, key: str) -> Tuple[bool, Any]:
        """Get a value by key.

        Args:
            key: The key to retrieve

        Returns:
            Tuple of (found, value) where found is True if key exists, False otherwise
        """
        with self._lock:
            self._operation_count += 1
            if key not in self._data:
                return (False, None)

            if key in self._expiration and is_expired(self._expiration[key]):
                del self._data[key]
                del self._expiration[key]
                return (False, None)

            return (True, self._data[key])

    def delete(self, key: str) -> bool:
        """Delete a key.

        Args:
            key: The key to delete

        Returns:
            True if the key existed and was deleted, False if it didn't exist
        """
        with self._lock:
            self._operation_count += 1
            if key not in self._data:
                return False

            if key in self._expiration and is_expired(self._expiration[key]):
                del self._data[key]
                del self._expiration[key]
                return False

            del self._data[key]
            if key in self._expiration:
                del self._expiration[key]
            return True

    def exists(self, key: str) -> bool:
        """Check if a key exists and hasn't expired.

        Args:
            key: The key to check

        Returns:
            True if the key exists and hasn't expired, False otherwise
        """
        found, _ = self.get(key)
        return found

    def list_keys(self, prefix: Optional[str] = None) -> List[str]:
        """List all keys, optionally filtered by prefix.

        Args:
            prefix: Optional prefix to filter keys

        Returns:
            List of keys that match the prefix (if provided) and haven't expired
        """
        with self._lock:
            current_time = get_current_timestamp()
            keys = []

            for key in self._data.keys():
                if key in self._expiration and is_expired(self._expiration[key]):
                    continue

                if prefix is None or key.startswith(prefix):
                    keys.append(key)

            return sorted(keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get store statistics.

        Returns:
            Dictionary with stats including total_keys, total_operations, and uptime_seconds
        """
        with self._lock:
            current_time = get_current_timestamp()
            valid_keys = []

            for key in self._data.keys():
                if key not in self._expiration or not is_expired(self._expiration[key]):
                    valid_keys.append(key)

            total_size = 0
            for key in valid_keys:
                value = self._data[key]
                if isinstance(value, str):
                    total_size += len(value.encode('utf-8'))
                elif isinstance(value, (int, float, bool)):
                    total_size += len(str(value).encode('utf-8'))
                elif value is None:
                    total_size += 4
                else:
                    import json
                    total_size += len(json.dumps(value).encode('utf-8'))

            uptime = int(time.time() - self._start_time)

            return {
                'keys': len(valid_keys),
                'size_bytes': total_size,
                'total_keys': len(valid_keys),
                'total_operations': self._operation_count,
                'uptime_seconds': uptime
            }

    def clear(self) -> None:
        """Clear all data from the store."""
        with self._lock:
            self._data.clear()
            self._expiration.clear()
