"""Prefix scanning tests."""

import pytest


class TestPrefixScanning:
    def test_prefix_filter_basic(self, client):
        client.put("user:1", "alice")
        client.put("user:2", "bob")
        client.put("post:1", "hello")
        client.put("post:2", "world")

        resp = client.list_keys(prefix="user:")
        keys = resp.json()["keys"]
        assert sorted(keys) == ["user:1", "user:2"]

    def test_prefix_filter_no_matches(self, client):
        client.put("foo", 1)
        client.put("bar", 2)

        resp = client.list_keys(prefix="baz:")
        assert resp.json()["keys"] == []

    def test_prefix_filter_all_match(self, client):
        client.put("prefix:a", 1)
        client.put("prefix:b", 2)
        client.put("prefix:c", 3)

        resp = client.list_keys(prefix="prefix:")
        keys = resp.json()["keys"]
        assert len(keys) == 3

    def test_prefix_empty_string_returns_all(self, client):
        client.put("a", 1)
        client.put("b", 2)

        resp = client.list_keys(prefix="")
        keys = resp.json()["keys"]
        assert sorted(keys) == ["a", "b"]

    def test_prefix_exact_key_match(self, client):
        client.put("exact", "value")
        client.put("exactly", "value2")

        resp = client.list_keys(prefix="exact")
        keys = resp.json()["keys"]
        assert sorted(keys) == ["exact", "exactly"]

    def test_prefix_with_special_characters(self, client):
        # Keys with slashes require URL encoding; use colons instead
        client.put("path:to:file1", 1)
        client.put("path:to:file2", 2)
        client.put("path:other", 3)

        resp = client.list_keys(prefix="path:to:")
        keys = resp.json()["keys"]
        assert sorted(keys) == ["path:to:file1", "path:to:file2"]

    def test_prefix_case_sensitive(self, client):
        client.put("User:1", "upper")
        client.put("user:2", "lower")

        resp = client.list_keys(prefix="User:")
        keys = resp.json()["keys"]
        assert keys == ["User:1"]

    def test_prefix_excludes_expired(self, client):
        import time
        client.put("ns:permanent", "value")
        client.put("ns:temporary", "value", ttl=1)
        time.sleep(1.5)

        resp = client.list_keys(prefix="ns:")
        keys = resp.json()["keys"]
        assert keys == ["ns:permanent"]
