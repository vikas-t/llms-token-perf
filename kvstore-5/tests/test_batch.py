"""Batch operation tests."""

import pytest


class TestBatchOperations:
    def test_batch_multiple_sets(self, client):
        resp = client.batch([
            {"op": "set", "key": "b1", "value": "v1"},
            {"op": "set", "key": "b2", "value": "v2"},
            {"op": "set", "key": "b3", "value": "v3"},
        ])
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify all were set
        assert client.get("b1").json()["value"] == "v1"
        assert client.get("b2").json()["value"] == "v2"
        assert client.get("b3").json()["value"] == "v3"

    def test_batch_set_and_delete(self, client):
        client.put("to_delete", "value")

        resp = client.batch([
            {"op": "set", "key": "new_key", "value": "new_value"},
            {"op": "delete", "key": "to_delete"},
        ])
        assert resp.status_code == 200

        assert client.get("new_key").json()["value"] == "new_value"
        assert client.get("to_delete").status_code == 404

    def test_batch_with_ttl(self, client):
        import time
        resp = client.batch([
            {"op": "set", "key": "ttl_batch", "value": "temp", "ttl": 1},
            {"op": "set", "key": "no_ttl_batch", "value": "perm"},
        ])
        assert resp.status_code == 200

        time.sleep(1.5)
        assert client.get("ttl_batch").status_code == 404
        assert client.get("no_ttl_batch").status_code == 200

    def test_batch_empty_operations(self, client):
        resp = client.batch([])
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_batch_delete_nonexistent(self, client):
        # Deleting non-existent key in batch should not fail the batch
        resp = client.batch([
            {"op": "set", "key": "exists", "value": "v"},
            {"op": "delete", "key": "does_not_exist"},
        ])
        assert resp.status_code == 200
        assert client.get("exists").status_code == 200

    def test_batch_returns_results(self, client):
        client.put("existing", "old")

        resp = client.batch([
            {"op": "set", "key": "new", "value": "v1"},
            {"op": "set", "key": "existing", "value": "v2"},
        ])
        data = resp.json()
        assert data["success"] is True
        assert "results" in data
        assert len(data["results"]) == 2

    def test_batch_invalid_operation(self, client):
        resp = client.batch([
            {"op": "invalid_op", "key": "k", "value": "v"},
        ])
        assert resp.status_code == 400
        assert "error" in resp.json()
