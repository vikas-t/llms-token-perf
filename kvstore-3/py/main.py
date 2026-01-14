#!/usr/bin/env python3
"""KVStore HTTP server entry point."""

import argparse
import os
from kvstore import KVStore, WAL, create_app


def main():
    """Main entry point for the KVStore server."""
    parser = argparse.ArgumentParser(description='KVStore HTTP API server')
    parser.add_argument('--port', type=int, default=None,
                        help='HTTP server port (default: from PORT env or 8080)')
    parser.add_argument('--data-dir', type=str, default=None,
                        help='Directory for WAL file (default: from DATA_DIR env or ./data)')

    args = parser.parse_args()

    port = args.port or int(os.environ.get('PORT', 8080))
    data_dir = args.data_dir or os.environ.get('DATA_DIR', './data')

    store = KVStore()
    wal = WAL(data_dir)

    print(f'Replaying WAL from {data_dir}...')
    wal.replay(store)

    app = create_app(store, wal)

    print(f'Starting KVStore server on port {port}...')
    app.run(host='0.0.0.0', port=port, threaded=True)


if __name__ == '__main__':
    main()
