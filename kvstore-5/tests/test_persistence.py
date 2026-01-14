"""Persistence and WAL tests."""

import pytest
import os
import signal
import time


class TestPersistence:
    def test_data_survives_restart(self, server, client):
        """Data should persist across server restarts."""
        # Set some data
        client.put("persist1", "value1")
        client.put("persist2", {"nested": "data"})

        # Restart the server
        proc = server["proc"]
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)

        # Start a new server instance
        from conftest import get_server_command
        import subprocess

        cmd, cwd = get_server_command()
        env = os.environ.copy()
        env["PORT"] = str(int(os.environ.get("KVSTORE_PORT", "18080")))
        env["DATA_DIR"] = server["data_dir"]

        new_proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        server["proc"] = new_proc

        # Wait for new server
        import requests
        for _ in range(30):
            try:
                requests.get(f"{server['url']}/stats", timeout=1)
                break
            except:
                time.sleep(0.5)

        # Verify data persisted
        resp = client.get("persist1")
        assert resp.status_code == 200
        assert resp.json()["value"] == "value1"

        resp = client.get("persist2")
        assert resp.status_code == 200
        assert resp.json()["value"] == {"nested": "data"}

    def test_wal_file_exists(self, server, client):
        """WAL file should be created when data is written."""
        client.put("wal_test", "value")

        wal_path = os.path.join(server["data_dir"], "wal.log")
        assert os.path.exists(wal_path), "WAL file should exist"

    def test_deleted_keys_not_restored(self, server, client):
        """Deleted keys should stay deleted after restart."""
        client.put("temp_key", "value")
        client.delete("temp_key")

        # Restart
        proc = server["proc"]
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)

        from conftest import get_server_command
        import subprocess

        cmd, cwd = get_server_command()
        env = os.environ.copy()
        env["PORT"] = str(int(os.environ.get("KVSTORE_PORT", "18080")))
        env["DATA_DIR"] = server["data_dir"]

        new_proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        server["proc"] = new_proc

        import requests
        for _ in range(30):
            try:
                requests.get(f"{server['url']}/stats", timeout=1)
                break
            except:
                time.sleep(0.5)

        # Should still be deleted
        assert client.get("temp_key").status_code == 404

    def test_ttl_preserved_across_restart(self, server, client):
        """TTL should be preserved after restart."""
        client.put("ttl_persist", "value", ttl=60)

        # Restart
        proc = server["proc"]
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)

        from conftest import get_server_command
        import subprocess

        cmd, cwd = get_server_command()
        env = os.environ.copy()
        env["PORT"] = str(int(os.environ.get("KVSTORE_PORT", "18080")))
        env["DATA_DIR"] = server["data_dir"]

        new_proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        server["proc"] = new_proc

        import requests
        for _ in range(30):
            try:
                requests.get(f"{server['url']}/stats", timeout=1)
                break
            except:
                time.sleep(0.5)

        # Should still exist (TTL not expired)
        assert client.get("ttl_persist").status_code == 200

    def test_many_operations_persisted(self, server, client):
        """Many operations should all be persisted correctly."""
        for i in range(100):
            client.put(f"multi_{i}", i)

        # Restart
        proc = server["proc"]
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)

        from conftest import get_server_command
        import subprocess

        cmd, cwd = get_server_command()
        env = os.environ.copy()
        env["PORT"] = str(int(os.environ.get("KVSTORE_PORT", "18080")))
        env["DATA_DIR"] = server["data_dir"]

        new_proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        server["proc"] = new_proc

        import requests
        for _ in range(30):
            try:
                requests.get(f"{server['url']}/stats", timeout=1)
                break
            except:
                time.sleep(0.5)

        # Verify all persisted
        for i in range(100):
            resp = client.get(f"multi_{i}")
            assert resp.status_code == 200
            assert resp.json()["value"] == i
