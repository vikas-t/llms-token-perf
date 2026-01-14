"""Shared test configuration for kvstore implementations."""

import os
import pytest
import requests
import subprocess
import time
import signal
import shutil

# Get implementation from environment
IMPL = os.environ.get("KVSTORE_IMPL", "python")
PORT = int(os.environ.get("KVSTORE_PORT", "18080"))
BASE_URL = f"http://localhost:{PORT}"


def get_server_command():
    """Return the command to start the server for the current implementation."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if IMPL == "python":
        return ["python3", "-m", "kvstore", "--port", str(PORT)], os.path.join(base_dir, "python")
    elif IMPL == "typescript":
        return ["npx", "ts-node", "src/index.ts", "--port", str(PORT)], os.path.join(base_dir, "typescript")
    elif IMPL == "go":
        return ["go", "run", ".", "--port", str(PORT)], os.path.join(base_dir, "go")
    else:
        raise ValueError(f"Unknown implementation: {IMPL}")


@pytest.fixture(scope="session")
def server():
    """Start the kvstore server for the test session."""
    cmd, cwd = get_server_command()

    # Clean data directory
    data_dir = os.path.join(cwd, "data")
    if os.path.exists(data_dir):
        shutil.rmtree(data_dir)
    os.makedirs(data_dir, exist_ok=True)

    # Set environment
    env = os.environ.copy()
    env["PORT"] = str(PORT)
    env["DATA_DIR"] = data_dir

    # Start server
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to be ready
    max_attempts = 30
    for i in range(max_attempts):
        try:
            requests.get(f"{BASE_URL}/stats", timeout=1)
            break
        except requests.exceptions.ConnectionError:
            if proc.poll() is not None:
                stdout, stderr = proc.communicate()
                raise RuntimeError(f"Server failed to start:\n{stderr.decode()}")
            time.sleep(0.5)
    else:
        proc.kill()
        raise RuntimeError("Server did not start in time")

    yield {"url": BASE_URL, "proc": proc, "data_dir": data_dir}

    # Cleanup
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def client(server):
    """Provide a test client with the base URL."""
    class Client:
        def __init__(self, base_url):
            self.base_url = base_url

        def get(self, key):
            return requests.get(f"{self.base_url}/kv/{key}")

        def put(self, key, value, ttl=None):
            body = {"value": value}
            if ttl is not None:
                body["ttl"] = ttl
            return requests.put(f"{self.base_url}/kv/{key}", json=body)

        def delete(self, key):
            return requests.delete(f"{self.base_url}/kv/{key}")

        def list_keys(self, prefix=None):
            params = {}
            if prefix:
                params["prefix"] = prefix
            return requests.get(f"{self.base_url}/kv", params=params)

        def batch(self, operations):
            return requests.post(f"{self.base_url}/kv/batch", json={"operations": operations})

        def stats(self):
            return requests.get(f"{self.base_url}/stats")

        def clear_all(self):
            """Helper to clear all keys for test isolation."""
            resp = self.list_keys()
            if resp.status_code == 200:
                keys = resp.json().get("keys", [])
                for key in keys:
                    self.delete(key)

    c = Client(server["url"])
    c.clear_all()  # Start each test with clean state
    return c
