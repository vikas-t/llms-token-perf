"""HTTP server and route handlers."""

from flask import Flask, request, jsonify
from typing import Optional
from .store import KVStore
from .wal import WAL


def create_app(store: KVStore, wal: WAL) -> Flask:
    """Create and configure Flask application.

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
        return jsonify({"keys": keys})

    @app.route('/kv/<key>', methods=['GET'])
    def get_key(key: str):
        """Get value for a specific key."""
        found, value = store.get(key)
        if not found:
            return jsonify({"error": "key not found"}), 404
        return jsonify({"key": key, "value": value})

    @app.route('/kv/<key>', methods=['PUT'])
    def set_key(key: str):
        """Set or update a key's value with optional TTL."""
        data = request.get_json()
        if data is None or 'value' not in data:
            return jsonify({"error": "value required"}), 400

        value = data['value']
        ttl = data.get('ttl')

        # Write to WAL first
        wal.append_set(key, value, ttl)

        # Then update in-memory store
        created = store.set(key, value, ttl)

        return jsonify({"key": key, "value": value, "created": created})

    @app.route('/kv/<key>', methods=['DELETE'])
    def delete_key(key: str):
        """Delete a key."""
        # Write to WAL first
        wal.append_delete(key)

        # Then delete from in-memory store
        existed = store.delete(key)

        if not existed:
            return jsonify({"error": "key not found"}), 404

        return jsonify({"deleted": True})

    @app.route('/kv/batch', methods=['POST'])
    def batch_operations():
        """Execute multiple operations in a single request."""
        data = request.get_json()
        if data is None or 'operations' not in data:
            return jsonify({"error": "operations required"}), 400

        operations = data['operations']
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

                results.append({"success": True})

            elif op == 'get':
                found, value = store.get(key)
                if not found:
                    results.append({"error": "key not found"})
                else:
                    results.append({"value": value})

            elif op == 'delete':
                # Write to WAL
                wal.append_delete(key)

                # Delete from store
                existed = store.delete(key)

                if not existed:
                    results.append({"error": "key not found"})
                else:
                    results.append({"success": True})

            else:
                # Invalid operation - return 400
                return jsonify({"error": f"unknown operation: {op}"}), 400

        return jsonify({"success": True, "results": results})

    return app
