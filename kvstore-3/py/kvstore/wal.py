"""Write-Ahead Log implementation for persistence."""

import json
import os
from typing import Any, Optional
from .utils import get_current_timestamp


class WAL:
    """Write-Ahead Log for persisting operations.

    Logs all write operations (set, delete) to an append-only file.
    Supports replay on startup for crash recovery.
    """

    def __init__(self, data_dir: str):
        """Initialize the WAL.

        Args:
            data_dir: Directory where the WAL file will be stored
        """
        self.data_dir = data_dir
        self.wal_path = os.path.join(data_dir, 'wal.log')

        os.makedirs(data_dir, exist_ok=True)

        if not os.path.exists(self.wal_path):
            open(self.wal_path, 'a').close()

    def log_set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Log a set operation.

        Args:
            key: The key being set
            value: The value being stored
            ttl: Optional TTL in seconds
        """
        entry = {
            'op': 'set',
            'key': key,
            'value': value,
            'timestamp': get_current_timestamp()
        }
        if ttl is not None:
            entry['ttl'] = ttl

        with open(self.wal_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    def log_delete(self, key: str) -> None:
        """Log a delete operation.

        Args:
            key: The key being deleted
        """
        entry = {
            'op': 'delete',
            'key': key,
            'timestamp': get_current_timestamp()
        }

        with open(self.wal_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    def replay(self, store) -> None:
        """Replay all operations from the WAL to restore state.

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
                    op = entry.get('op')

                    if op == 'set':
                        key = entry['key']
                        value = entry['value']
                        ttl = entry.get('ttl')
                        timestamp = entry.get('timestamp', get_current_timestamp())

                        if ttl is not None:
                            expiration_time = timestamp + ttl
                            remaining_ttl = expiration_time - get_current_timestamp()

                            if remaining_ttl > 0:
                                store.set(key, value, ttl=remaining_ttl)
                        else:
                            store.set(key, value)

                    elif op == 'delete':
                        key = entry['key']
                        store.delete(key)

                except (json.JSONDecodeError, KeyError):
                    continue
