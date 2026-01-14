"""Concurrency safety tests."""

import pytest
import threading
import time


class TestConcurrency:
    def test_concurrent_writes_same_key(self, client):
        """Multiple threads writing to same key should not corrupt data."""
        results = []
        errors = []

        def writer(n):
            try:
                for i in range(10):
                    client.put("concurrent_key", f"writer_{n}_iter_{i}")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"

        # Key should have some value (from one of the writers)
        resp = client.get("concurrent_key")
        assert resp.status_code == 200
        assert "writer_" in resp.json()["value"]

    def test_concurrent_writes_different_keys(self, client):
        """Multiple threads writing to different keys should all succeed."""
        errors = []

        def writer(n):
            try:
                for i in range(10):
                    client.put(f"key_{n}_{i}", f"value_{n}_{i}")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0

        # Verify all keys exist
        for n in range(5):
            for i in range(10):
                resp = client.get(f"key_{n}_{i}")
                assert resp.status_code == 200

    def test_concurrent_read_write(self, client):
        """Reads and writes happening concurrently should not crash."""
        client.put("rw_key", "initial")
        errors = []

        def reader():
            try:
                for _ in range(20):
                    resp = client.get("rw_key")
                    # Should either get 200 or 404 (if deleted), never crash
                    assert resp.status_code in [200, 404]
            except Exception as e:
                errors.append(e)

        def writer():
            try:
                for i in range(20):
                    if i % 2 == 0:
                        client.put("rw_key", f"value_{i}")
                    else:
                        client.delete("rw_key")
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=reader),
            threading.Thread(target=reader),
            threading.Thread(target=writer),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0

    def test_concurrent_batch_operations(self, client):
        """Batch operations should be atomic and thread-safe."""
        errors = []

        def batch_writer(n):
            try:
                for i in range(5):
                    client.batch([
                        {"op": "set", "key": f"batch_{n}_a_{i}", "value": i},
                        {"op": "set", "key": f"batch_{n}_b_{i}", "value": i * 2},
                    ])
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=batch_writer, args=(i,)) for i in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0

    def test_concurrent_list_operations(self, client):
        """List operations during writes should not crash."""
        for i in range(10):
            client.put(f"list_test_{i}", i)

        errors = []
        lists_returned = []

        def lister():
            try:
                for _ in range(10):
                    resp = client.list_keys()
                    assert resp.status_code == 200
                    lists_returned.append(len(resp.json()["keys"]))
            except Exception as e:
                errors.append(e)

        def modifier():
            try:
                for i in range(10, 20):
                    client.put(f"list_test_{i}", i)
                    time.sleep(0.01)
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=lister),
            threading.Thread(target=lister),
            threading.Thread(target=modifier),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
