"""Entry point for running kvstore as a module (python -m kvstore)."""

import os
import argparse
from .store import KVStore
from .wal import WAL
from .server import create_app


def main():
    """Main entry point for the KVStore server."""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='KVStore HTTP API Server')
    parser.add_argument('--port', type=int, help='Port to listen on')
    parser.add_argument('--data-dir', type=str, help='Directory for data storage')
    args = parser.parse_args()

    # Get configuration from args, env, or defaults
    port = args.port or int(os.environ.get('PORT', '8080'))
    data_dir = args.data_dir or os.environ.get('DATA_DIR', './data')

    # Initialize store and WAL
    store = KVStore()
    wal = WAL(data_dir)

    # Replay WAL to restore state
    wal.replay(store)

    # Create and run Flask app
    app = create_app(store, wal)
    app.run(host='0.0.0.0', port=port, threaded=True)


if __name__ == '__main__':
    main()
