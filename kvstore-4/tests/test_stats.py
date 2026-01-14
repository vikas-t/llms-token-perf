"""Stats endpoint tests."""

import pytest
import time


class TestStats:
    def test_stats_endpoint_returns_200(self, client):
        resp = client.stats()
        assert resp.status_code == 200

    def test_stats_has_required_fields(self, client):
        resp = client.stats()
        data = resp.json()
        assert "total_keys" in data
        assert "total_operations" in data
        assert "uptime_seconds" in data

    def test_stats_total_keys_count(self, client):
        # Initially should be 0
        assert client.stats().json()["total_keys"] == 0

        client.put("k1", "v1")
        assert client.stats().json()["total_keys"] == 1

        client.put("k2", "v2")
        assert client.stats().json()["total_keys"] == 2

        client.delete("k1")
        assert client.stats().json()["total_keys"] == 1

    def test_stats_operations_count(self, client):
        initial = client.stats().json()["total_operations"]

        client.put("op1", "v1")
        client.get("op1")
        client.delete("op1")

        final = client.stats().json()["total_operations"]
        assert final >= initial + 3

    def test_stats_uptime_increases(self, client):
        uptime1 = client.stats().json()["uptime_seconds"]
        time.sleep(1.1)
        uptime2 = client.stats().json()["uptime_seconds"]
        assert uptime2 > uptime1
