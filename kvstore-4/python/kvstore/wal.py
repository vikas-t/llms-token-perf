"""Write-Ahead Log implementation for persistence."""

import os
import json
import threading
from typing import Optional, Dict, Any
from .utils import current_timestamp


class WAL:
    """Write-Ahead Log for persisting operations."""

    def __init__(self, data_dir: str):
        """Initialize WAL.

        Args:
            data_dir: Directory to store the WAL file
        """
        self.data_dir = data_dir
        self.wal_path = os.path.join(data_dir, "wal.log")
        self._lock = threading.Lock()

        # Ensure data directory exists
        os.makedirs(data_dir, exist_ok=True)

    def append_set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Append a SET operation to the WAL.

        Args:
            key: The key being set
            value: The value being stored
            ttl: Optional TTL in seconds
        """
        entry: Dict[str, Any] = {
            "op": "set",
            "key": key,
            "value": value,
            "timestamp": current_timestamp()
        }
        if ttl is not None:
            entry["ttl"] = ttl

        self._append(entry)

    def append_delete(self, key: str) -> None:
        """Append a DELETE operation to the WAL.

        Args:
            key: The key being deleted
        """
        entry = {
            "op": "delete",
            "key": key,
            "timestamp": current_timestamp()
        }
        self._append(entry)

    def _append(self, entry: Dict[str, Any]) -> None:
        """Append an entry to the WAL file.

        Args:
            entry: Dictionary representing the operation
        """
        with self._lock:
            with open(self.wal_path, 'a') as f:
                f.write(json.dumps(entry) + '\n')
                f.flush()
                os.fsync(f.fileno())

    def replay(self, store) -> None:
        """Replay WAL entries to restore state.

        Args:
            store: KVStore instance to replay operations into
        """
        if not os.path.exists(self.wal_path):
            return

        with open(self.wal_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    op = entry.get("op")

                    if op == "set":
                        key = entry["key"]
                        value = entry["value"]
                        ttl = entry.get("ttl")
                        store.set(key, value, ttl)
                    elif op == "delete":
                        key = entry["key"]
                        store.delete(key)
                except (json.JSONDecodeError, KeyError) as e:
                    # Skip malformed entries
                    continue
