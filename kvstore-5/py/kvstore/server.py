"""HTTP server routes and handlers."""
from flask import Flask, request, jsonify
from typing import Any, Dict
from .store import KVStore
from .wal import WAL


def create_app(store: KVStore, wal: WAL) -> Flask:
    """Create and configure Flask app.

    Args:
        store: KVStore instance
        wal: WAL instance

    Returns:
        Configured Flask app
    """
    app = Flask(__name__)

    @app.route('/stats', methods=['GET'])
    def get_stats():
        """Get store statistics."""
        stats = store.stats()
        return jsonify(stats)

    @app.route('/kv', methods=['GET'])
    def list_keys():
        """List all keys with optional prefix filtering."""
        prefix = request.args.get('prefix')
        keys = store.list_keys(prefix=prefix)
        return jsonify({'keys': keys})

    @app.route('/kv/<path:key>', methods=['GET'])
    def get_key(key: str):
        """Get value for a specific key."""
        value = store.get(key)
        if value is None:
            return jsonify({'error': 'key not found'}), 404
        return jsonify({'value': value})

    @app.route('/kv/<path:key>', methods=['PUT'])
    def set_key(key: str):
        """Set or update a key's value with optional TTL."""
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'invalid JSON'}), 400

        value = data.get('value')
        ttl = data.get('ttl')

        # Write to WAL first
        wal.append_set(key, value, ttl)

        # Then update in-memory store
        store.set(key, value, ttl)

        return jsonify({'success': True})

    @app.route('/kv/<path:key>', methods=['DELETE'])
    def delete_key(key: str):
        """Delete a key."""
        # Check if key exists first
        if store.get(key) is None:
            return jsonify({'error': 'key not found'}), 404

        # Write to WAL first
        wal.append_delete(key)

        # Then delete from in-memory store
        store.delete(key)

        return jsonify({'success': True})

    @app.route('/kv/batch', methods=['POST'])
    def batch_operations():
        """Execute multiple operations in a single request."""
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'invalid JSON'}), 400

        operations = data.get('operations', [])
        results = []

        for op_data in operations:
            op = op_data.get('op')
            key = op_data.get('key')

            if op == 'set':
                value = op_data.get('value')
                ttl = op_data.get('ttl')

                # Write to WAL
                wal.append_set(key, value, ttl)

                # Update store
                store.set(key, value, ttl)

                results.append({'success': True})

            elif op == 'get':
                value = store.get(key)
                if value is None:
                    results.append({'error': 'key not found'})
                else:
                    results.append({'value': value})

            elif op == 'delete':
                # Check if key exists
                if store.get(key) is None:
                    results.append({'success': True})
                else:
                    # Write to WAL
                    wal.append_delete(key)

                    # Delete from store
                    store.delete(key)

                    results.append({'success': True})

        return jsonify({'results': results})

    return app
