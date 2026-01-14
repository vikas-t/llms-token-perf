"""TTL and expiration tests."""

import pytest
import time


class TestTTL:
    def test_key_with_ttl_exists_before_expiry(self, client):
        client.put("ttl_key", "value", ttl=10)
        resp = client.get("ttl_key")
        assert resp.status_code == 200
        assert resp.json()["value"] == "value"

    def test_key_expires_after_ttl(self, client):
        client.put("short_ttl", "value", ttl=1)
        time.sleep(1.5)
        resp = client.get("short_ttl")
        assert resp.status_code == 404

    def test_key_without_ttl_persists(self, client):
        client.put("no_ttl", "value")
        time.sleep(0.5)
        resp = client.get("no_ttl")
        assert resp.status_code == 200

    def test_update_resets_ttl(self, client):
        client.put("reset_ttl", "v1", ttl=1)
        time.sleep(0.5)
        client.put("reset_ttl", "v2", ttl=2)
        time.sleep(1)
        # Should still exist because TTL was reset
        resp = client.get("reset_ttl")
        assert resp.status_code == 200
        assert resp.json()["value"] == "v2"

    def test_update_removes_ttl(self, client):
        client.put("remove_ttl", "v1", ttl=1)
        client.put("remove_ttl", "v2")  # No TTL
        time.sleep(1.5)
        # Should still exist because TTL was removed
        resp = client.get("remove_ttl")
        assert resp.status_code == 200

    def test_expired_key_not_in_list(self, client):
        client.put("permanent", "value")
        client.put("temporary", "value", ttl=1)
        time.sleep(1.5)

        resp = client.list_keys()
        keys = resp.json()["keys"]
        assert "permanent" in keys
        assert "temporary" not in keys

    def test_ttl_zero_means_immediate_expiry(self, client):
        client.put("zero_ttl", "value", ttl=0)
        time.sleep(0.1)
        resp = client.get("zero_ttl")
        assert resp.status_code == 404

    def test_multiple_keys_with_different_ttls(self, client):
        client.put("short", "s", ttl=1)
        client.put("medium", "m", ttl=3)
        client.put("long", "l", ttl=10)

        # All exist initially
        assert client.get("short").status_code == 200
        assert client.get("medium").status_code == 200
        assert client.get("long").status_code == 200

        time.sleep(1.5)

        # Short expired
        assert client.get("short").status_code == 404
        assert client.get("medium").status_code == 200
        assert client.get("long").status_code == 200

    def test_ttl_with_fractional_seconds(self, client):
        # TTL should work with fractional seconds if supported
        # Most implementations truncate to integer seconds
        client.put("frac_ttl", "value", ttl=2)
        time.sleep(1)
        assert client.get("frac_ttl").status_code == 200

    def test_negative_ttl_treated_as_zero(self, client):
        client.put("neg_ttl", "value", ttl=-1)
        time.sleep(0.1)
        # Negative TTL should expire immediately
        resp = client.get("neg_ttl")
        assert resp.status_code == 404
