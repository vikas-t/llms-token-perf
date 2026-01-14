"""HTTP server implementation with Flask."""

from flask import Flask, request, jsonify
from typing import Any, Dict
from .store import KVStore
from .wal import WAL


def create_app(store: KVStore, wal: WAL) -> Flask:
    """Create and configure the Flask application.

    Args:
        store: KVStore instance
        wal: WAL instance

    Returns:
        Configured Flask application
    """
    app = Flask(__name__)

    @app.route('/stats', methods=['GET'])
    def get_stats():
        """Get store statistics."""
        stats = store.get_stats()
        return jsonify(stats), 200

    @app.route('/kv', methods=['GET'])
    def list_keys():
        """List all keys with optional prefix filtering."""
        prefix = request.args.get('prefix')
        keys = store.list_keys(prefix=prefix)
        return jsonify({'keys': keys}), 200

    @app.route('/kv/<key>', methods=['GET'])
    def get_key(key: str):
        """Get value for a specific key."""
        found, value = store.get(key)
        if not found:
            return jsonify({'error': 'key not found'}), 404
        return jsonify({'key': key, 'value': value}), 200

    @app.route('/kv/<key>', methods=['PUT'])
    def set_key(key: str):
        """Set or update a key's value."""
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'invalid JSON'}), 400

        value = data.get('value')
        ttl = data.get('ttl')

        wal.log_set(key, value, ttl)
        created = store.set(key, value, ttl)

        return jsonify({'key': key, 'value': value, 'created': created}), 200

    @app.route('/kv/<key>', methods=['DELETE'])
    def delete_key(key: str):
        """Delete a key."""
        deleted = store.delete(key)
        if not deleted:
            return jsonify({'error': 'key not found'}), 404

        wal.log_delete(key)
        return jsonify({'deleted': True}), 200

    @app.route('/kv/batch', methods=['POST'])
    def batch_operations():
        """Execute multiple operations in a single request."""
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'invalid JSON'}), 400

        operations = data.get('operations', [])
        results = []
        has_invalid_op = False

        for operation in operations:
            op = operation.get('op')
            key = operation.get('key')

            if op == 'set':
                value = operation.get('value')
                ttl = operation.get('ttl')
                wal.log_set(key, value, ttl)
                store.set(key, value, ttl)
                results.append({'success': True})

            elif op == 'get':
                found, value = store.get(key)
                if not found:
                    results.append({'error': 'key not found'})
                else:
                    results.append({'value': value})

            elif op == 'delete':
                deleted = store.delete(key)
                if not deleted:
                    results.append({'error': 'key not found'})
                else:
                    wal.log_delete(key)
                    results.append({'success': True})

            else:
                has_invalid_op = True
                results.append({'error': f'unknown operation: {op}'})

        if has_invalid_op:
            return jsonify({'error': 'invalid operation'}), 400

        return jsonify({'success': True, 'results': results}), 200

    return app
