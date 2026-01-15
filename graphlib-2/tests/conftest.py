"""
Pytest configuration for graph library tests.
Supports Python, TypeScript, and Go implementations.

NOTE: All implementations use subprocess + CLI for fair comparison.
"""
import pytest
import subprocess
import json
import os

# Get implementation type from environment variable
IMPL = os.environ.get("IMPL", "py")

# Normalize implementation names
if IMPL in ("python", "py"):
    IMPL = "python"
elif IMPL in ("typescript", "ts"):
    IMPL = "typescript"
elif IMPL == "go":
    IMPL = "go"


def load_python_impl():
    """Load Python implementation via subprocess (same as TS/Go for fairness)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    py_dir = os.path.join(base_dir, "py")

    class PyBridge:
        def __init__(self):
            self.py_dir = py_dir

        def _call(self, cmd, *args):
            input_data = json.dumps(list(args))
            result = subprocess.run(
                ["python3", "cli.py", cmd],
                cwd=self.py_dir,
                input=input_data,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            return json.loads(result.stdout)

        def create_graph(self, options=None):
            return self._call("create_graph", options or {})

        def add_node(self, graph_id, node_id):
            return self._call("add_node", graph_id, node_id)

        def add_edge(self, graph_id, from_node, to_node, weight=None):
            if weight is not None:
                return self._call("add_edge", graph_id, from_node, to_node, weight)
            return self._call("add_edge", graph_id, from_node, to_node)

        def remove_node(self, graph_id, node_id):
            return self._call("remove_node", graph_id, node_id)

        def remove_edge(self, graph_id, from_node, to_node):
            return self._call("remove_edge", graph_id, from_node, to_node)

        def get_nodes(self, graph_id):
            return self._call("get_nodes", graph_id)

        def get_edges(self, graph_id):
            return self._call("get_edges", graph_id)

        def get_neighbors(self, graph_id, node_id):
            return self._call("get_neighbors", graph_id, node_id)

        def has_node(self, graph_id, node_id):
            return self._call("has_node", graph_id, node_id)

        def has_edge(self, graph_id, from_node, to_node):
            return self._call("has_edge", graph_id, from_node, to_node)

        def get_degree(self, graph_id, node_id):
            return self._call("get_degree", graph_id, node_id)

        def bfs(self, graph_id, start_node):
            return self._call("bfs", graph_id, start_node)

        def dfs(self, graph_id, start_node):
            return self._call("dfs", graph_id, start_node)

        def shortest_path(self, graph_id, start_node, end_node):
            return self._call("shortest_path", graph_id, start_node, end_node)

        def all_shortest_paths(self, graph_id, start_node):
            return self._call("all_shortest_paths", graph_id, start_node)

        def has_path(self, graph_id, start_node, end_node):
            return self._call("has_path", graph_id, start_node, end_node)

        def has_cycle(self, graph_id):
            return self._call("has_cycle", graph_id)

        def is_dag(self, graph_id):
            return self._call("is_dag", graph_id)

        def topological_sort(self, graph_id):
            return self._call("topological_sort", graph_id)

        def connected_components(self, graph_id):
            return self._call("connected_components", graph_id)

        def strongly_connected_components(self, graph_id):
            return self._call("strongly_connected_components", graph_id)

        def is_connected(self, graph_id):
            return self._call("is_connected", graph_id)

        def get_graph_info(self, graph_id):
            return self._call("get_graph_info", graph_id)

        def clear_graph(self, graph_id):
            return self._call("clear_graph", graph_id)

        def clone_graph(self, graph_id):
            return self._call("clone_graph", graph_id)

        def subgraph(self, graph_id, nodes):
            return self._call("subgraph", graph_id, nodes)

    return PyBridge()


def load_typescript_impl():
    """Load TypeScript implementation via subprocess."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ts_dir = os.path.join(base_dir, "ts")

    class TSBridge:
        def __init__(self):
            self.ts_dir = ts_dir
            # Build TypeScript first
            subprocess.run(["npm", "run", "build"], cwd=ts_dir, capture_output=True)

        def _call(self, cmd, *args):
            input_data = json.dumps(list(args))
            result = subprocess.run(
                ["node", "dist/cli.js", cmd],
                cwd=self.ts_dir,
                input=input_data,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            return json.loads(result.stdout)

        def create_graph(self, options=None):
            return self._call("create_graph", options or {})

        def add_node(self, graph_id, node_id):
            return self._call("add_node", graph_id, node_id)

        def add_edge(self, graph_id, from_node, to_node, weight=None):
            if weight is not None:
                return self._call("add_edge", graph_id, from_node, to_node, weight)
            return self._call("add_edge", graph_id, from_node, to_node)

        def remove_node(self, graph_id, node_id):
            return self._call("remove_node", graph_id, node_id)

        def remove_edge(self, graph_id, from_node, to_node):
            return self._call("remove_edge", graph_id, from_node, to_node)

        def get_nodes(self, graph_id):
            return self._call("get_nodes", graph_id)

        def get_edges(self, graph_id):
            return self._call("get_edges", graph_id)

        def get_neighbors(self, graph_id, node_id):
            return self._call("get_neighbors", graph_id, node_id)

        def has_node(self, graph_id, node_id):
            return self._call("has_node", graph_id, node_id)

        def has_edge(self, graph_id, from_node, to_node):
            return self._call("has_edge", graph_id, from_node, to_node)

        def get_degree(self, graph_id, node_id):
            return self._call("get_degree", graph_id, node_id)

        def bfs(self, graph_id, start_node):
            return self._call("bfs", graph_id, start_node)

        def dfs(self, graph_id, start_node):
            return self._call("dfs", graph_id, start_node)

        def shortest_path(self, graph_id, start_node, end_node):
            return self._call("shortest_path", graph_id, start_node, end_node)

        def all_shortest_paths(self, graph_id, start_node):
            return self._call("all_shortest_paths", graph_id, start_node)

        def has_path(self, graph_id, start_node, end_node):
            return self._call("has_path", graph_id, start_node, end_node)

        def has_cycle(self, graph_id):
            return self._call("has_cycle", graph_id)

        def is_dag(self, graph_id):
            return self._call("is_dag", graph_id)

        def topological_sort(self, graph_id):
            return self._call("topological_sort", graph_id)

        def connected_components(self, graph_id):
            return self._call("connected_components", graph_id)

        def strongly_connected_components(self, graph_id):
            return self._call("strongly_connected_components", graph_id)

        def is_connected(self, graph_id):
            return self._call("is_connected", graph_id)

        def get_graph_info(self, graph_id):
            return self._call("get_graph_info", graph_id)

        def clear_graph(self, graph_id):
            return self._call("clear_graph", graph_id)

        def clone_graph(self, graph_id):
            return self._call("clone_graph", graph_id)

        def subgraph(self, graph_id, nodes):
            return self._call("subgraph", graph_id, nodes)

    return TSBridge()


def load_go_impl():
    """Load Go implementation via subprocess."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    go_dir = os.path.join(base_dir, "go")

    # Build Go binary
    subprocess.run(["go", "build", "-o", "graphlib", "."], cwd=go_dir, capture_output=True)

    class GoBridge:
        def __init__(self):
            self.go_dir = go_dir

        def _call(self, cmd, *args):
            input_data = json.dumps(list(args))
            result = subprocess.run(
                ["./graphlib", cmd],
                cwd=self.go_dir,
                input=input_data,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            return json.loads(result.stdout)

        def create_graph(self, options=None):
            return self._call("create_graph", options or {})

        def add_node(self, graph_id, node_id):
            return self._call("add_node", graph_id, node_id)

        def add_edge(self, graph_id, from_node, to_node, weight=None):
            if weight is not None:
                return self._call("add_edge", graph_id, from_node, to_node, weight)
            return self._call("add_edge", graph_id, from_node, to_node)

        def remove_node(self, graph_id, node_id):
            return self._call("remove_node", graph_id, node_id)

        def remove_edge(self, graph_id, from_node, to_node):
            return self._call("remove_edge", graph_id, from_node, to_node)

        def get_nodes(self, graph_id):
            return self._call("get_nodes", graph_id)

        def get_edges(self, graph_id):
            return self._call("get_edges", graph_id)

        def get_neighbors(self, graph_id, node_id):
            return self._call("get_neighbors", graph_id, node_id)

        def has_node(self, graph_id, node_id):
            return self._call("has_node", graph_id, node_id)

        def has_edge(self, graph_id, from_node, to_node):
            return self._call("has_edge", graph_id, from_node, to_node)

        def get_degree(self, graph_id, node_id):
            return self._call("get_degree", graph_id, node_id)

        def bfs(self, graph_id, start_node):
            return self._call("bfs", graph_id, start_node)

        def dfs(self, graph_id, start_node):
            return self._call("dfs", graph_id, start_node)

        def shortest_path(self, graph_id, start_node, end_node):
            return self._call("shortest_path", graph_id, start_node, end_node)

        def all_shortest_paths(self, graph_id, start_node):
            return self._call("all_shortest_paths", graph_id, start_node)

        def has_path(self, graph_id, start_node, end_node):
            return self._call("has_path", graph_id, start_node, end_node)

        def has_cycle(self, graph_id):
            return self._call("has_cycle", graph_id)

        def is_dag(self, graph_id):
            return self._call("is_dag", graph_id)

        def topological_sort(self, graph_id):
            return self._call("topological_sort", graph_id)

        def connected_components(self, graph_id):
            return self._call("connected_components", graph_id)

        def strongly_connected_components(self, graph_id):
            return self._call("strongly_connected_components", graph_id)

        def is_connected(self, graph_id):
            return self._call("is_connected", graph_id)

        def get_graph_info(self, graph_id):
            return self._call("get_graph_info", graph_id)

        def clear_graph(self, graph_id):
            return self._call("clear_graph", graph_id)

        def clone_graph(self, graph_id):
            return self._call("clone_graph", graph_id)

        def subgraph(self, graph_id, nodes):
            return self._call("subgraph", graph_id, nodes)

    return GoBridge()


@pytest.fixture
def lib():
    """Load the appropriate implementation based on GRAPHLIB_IMPL env var."""
    if IMPL == "python":
        return load_python_impl()
    elif IMPL == "typescript":
        return load_typescript_impl()
    elif IMPL == "go":
        return load_go_impl()
    else:
        raise ValueError(f"Unknown implementation: {IMPL}")
