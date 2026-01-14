"""Core KVStore implementation with in-memory storage and TTL support."""
import threading
from typing import Any, Dict, List, Optional
from .utils import current_timestamp, is_expired


class KVStore:
    """Thread-safe key-value store with TTL support."""

    def __init__(self):
        """Initialize the key-value store."""
        self._data: Dict[str, Any] = {}
        self._expirations: Dict[str, int] = {}
        self._lock = threading.Lock()

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set a key-value pair with optional TTL.

        Args:
            key: The key to set
            value: The value to store
            ttl: Time-to-live in seconds (optional)
        """
        with self._lock:
            self._data[key] = value
            if ttl is not None:
                self._expirations[key] = current_timestamp() + ttl
            elif key in self._expirations:
                # Remove expiration if setting without TTL
                del self._expirations[key]

    def get(self, key: str) -> Optional[Any]:
        """Get a value by key.

        Args:
            key: The key to retrieve

        Returns:
            The value if key exists and not expired, None otherwise
        """
        with self._lock:
            # Check if key exists
            if key not in self._data:
                return None

            # Check if expired
            if key in self._expirations and is_expired(self._expirations[key]):
                # Lazy deletion
                del self._data[key]
                del self._expirations[key]
                return None

            return self._data[key]

    def delete(self, key: str) -> bool:
        """Delete a key.

        Args:
            key: The key to delete

        Returns:
            True if key was deleted, False if key didn't exist
        """
        with self._lock:
            # Check if key exists and not expired
            if key not in self._data:
                return False

            if key in self._expirations and is_expired(self._expirations[key]):
                # Already expired, treat as not found
                del self._data[key]
                del self._expirations[key]
                return False

            # Delete the key
            del self._data[key]
            if key in self._expirations:
                del self._expirations[key]
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

            for key in list(self._data.keys()):
                if key in self._expirations and is_expired(self._expirations[key]):
                    expired_keys.append(key)
                elif prefix is None or key.startswith(prefix):
                    valid_keys.append(key)

            # Clean up expired keys
            for key in expired_keys:
                del self._data[key]
                del self._expirations[key]

            return sorted(valid_keys)

    def stats(self) -> Dict[str, int]:
        """Get store statistics.

        Returns:
            Dictionary with 'keys' and 'size_bytes'
        """
        with self._lock:
            # Clean up expired keys first
            expired_keys = []
            for key in list(self._data.keys()):
                if key in self._expirations and is_expired(self._expirations[key]):
                    expired_keys.append(key)

            for key in expired_keys:
                del self._data[key]
                del self._expirations[key]

            # Calculate stats
            total_size = 0
            for value in self._data.values():
                # Estimate size in bytes
                total_size += len(str(value).encode('utf-8'))

            return {
                'keys': len(self._data),
                'size_bytes': total_size
            }
