"""Basic CRUD operation tests."""

import pytest


class TestGet:
    def test_get_existing_key(self, client):
        client.put("foo", "bar")
        resp = client.get("foo")
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "foo"
        assert data["value"] == "bar"

    def test_get_nonexistent_key(self, client):
        resp = client.get("nonexistent")
        assert resp.status_code == 404
        assert "error" in resp.json()

    def test_get_with_special_characters(self, client):
        client.put("key-with-dashes", "value1")
        client.put("key_with_underscores", "value2")
        client.put("key.with.dots", "value3")

        assert client.get("key-with-dashes").json()["value"] == "value1"
        assert client.get("key_with_underscores").json()["value"] == "value2"
        assert client.get("key.with.dots").json()["value"] == "value3"


class TestPut:
    def test_put_new_key(self, client):
        resp = client.put("newkey", "newvalue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "newkey"
        assert data["value"] == "newvalue"
        assert data["created"] is True

    def test_put_update_existing(self, client):
        client.put("key1", "original")
        resp = client.put("key1", "updated")
        assert resp.status_code == 200
        data = resp.json()
        assert data["value"] == "updated"
        assert data["created"] is False

    def test_put_various_value_types(self, client):
        # String
        client.put("str", "hello")
        assert client.get("str").json()["value"] == "hello"

        # Number
        client.put("num", 42)
        assert client.get("num").json()["value"] == 42

        # Float
        client.put("float", 3.14)
        assert client.get("float").json()["value"] == 3.14

        # Boolean
        client.put("bool", True)
        assert client.get("bool").json()["value"] is True

        # Null
        client.put("null", None)
        assert client.get("null").json()["value"] is None

        # Array
        client.put("arr", [1, 2, 3])
        assert client.get("arr").json()["value"] == [1, 2, 3]

        # Object
        client.put("obj", {"nested": "value"})
        assert client.get("obj").json()["value"] == {"nested": "value"}

    def test_put_empty_value(self, client):
        client.put("empty_str", "")
        assert client.get("empty_str").json()["value"] == ""

        client.put("empty_arr", [])
        assert client.get("empty_arr").json()["value"] == []

        client.put("empty_obj", {})
        assert client.get("empty_obj").json()["value"] == {}


class TestDelete:
    def test_delete_existing_key(self, client):
        client.put("to_delete", "value")
        resp = client.delete("to_delete")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Verify it's gone
        assert client.get("to_delete").status_code == 404

    def test_delete_nonexistent_key(self, client):
        resp = client.delete("never_existed")
        assert resp.status_code == 404
        assert "error" in resp.json()


class TestList:
    def test_list_empty(self, client):
        resp = client.list_keys()
        assert resp.status_code == 200
        assert resp.json()["keys"] == []

    def test_list_all_keys(self, client):
        client.put("a", 1)
        client.put("b", 2)
        client.put("c", 3)

        resp = client.list_keys()
        assert resp.status_code == 200
        keys = resp.json()["keys"]
        assert sorted(keys) == ["a", "b", "c"]

    def test_list_after_delete(self, client):
        client.put("keep", 1)
        client.put("remove", 2)
        client.delete("remove")

        resp = client.list_keys()
        assert resp.json()["keys"] == ["keep"]
