"""Write-Ahead Log implementation for persistence."""
import json
import os
from typing import Any, Optional
from .utils import current_timestamp


class WAL:
    """Write-ahead log for persisting operations."""

    def __init__(self, data_dir: str):
        """Initialize WAL.

        Args:
            data_dir: Directory to store WAL file
        """
        self.data_dir = data_dir
        self.wal_path = os.path.join(data_dir, 'wal.log')

        # Create data directory if it doesn't exist
        os.makedirs(data_dir, exist_ok=True)

        # Create WAL file if it doesn't exist
        if not os.path.exists(self.wal_path):
            open(self.wal_path, 'w').close()

    def append_set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Append a SET operation to the WAL.

        Args:
            key: The key being set
            value: The value being stored
            ttl: Time-to-live in seconds (optional)
        """
        entry = {
            'op': 'set',
            'key': key,
            'value': value,
            'timestamp': current_timestamp()
        }
        if ttl is not None:
            entry['ttl'] = ttl

        with open(self.wal_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    def append_delete(self, key: str) -> None:
        """Append a DELETE operation to the WAL.

        Args:
            key: The key being deleted
        """
        entry = {
            'op': 'delete',
            'key': key,
            'timestamp': current_timestamp()
        }

        with open(self.wal_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    def replay(self, store) -> None:
        """Replay WAL entries to restore state.

        Args:
            store: KVStore instance to replay operations on
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
                    op = entry.get('op')

                    if op == 'set':
                        key = entry['key']
                        value = entry['value']
                        ttl = entry.get('ttl')

                        # Calculate remaining TTL if original operation had TTL
                        if ttl is not None:
                            timestamp = entry.get('timestamp', current_timestamp())
                            elapsed = current_timestamp() - timestamp
                            remaining_ttl = ttl - elapsed

                            # Only set if not expired
                            if remaining_ttl > 0:
                                store.set(key, value, remaining_ttl)
                        else:
                            store.set(key, value, None)

                    elif op == 'delete':
                        key = entry['key']
                        store.delete(key)

                except (json.JSONDecodeError, KeyError):
                    # Skip malformed entries
                    continue
