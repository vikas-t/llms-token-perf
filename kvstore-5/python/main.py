"""KVStore HTTP server entry point."""
import argparse
import os
from kvstore.store import KVStore
from kvstore.wal import WAL
from kvstore.server import create_app


def main():
    """Main entry point."""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='KVStore HTTP API Server')
    parser.add_argument('--port', type=int, help='HTTP server port')
    parser.add_argument('--data-dir', type=str, help='Directory for data storage')
    args = parser.parse_args()

    # Get configuration from args or environment
    port = args.port or int(os.environ.get('PORT', '8080'))
    data_dir = args.data_dir or os.environ.get('DATA_DIR', './data')

    # Initialize store and WAL
    store = KVStore()
    wal = WAL(data_dir)

    # Replay WAL to restore state
    wal.replay(store)

    # Create and run Flask app
    app = create_app(store, wal)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)


if __name__ == '__main__':
    main()
