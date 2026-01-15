"""Tests for cycle detection, topological sort, and connected components."""
import pytest


class TestHasCycle:
    """Tests for has_cycle."""

    def test_no_cycle_empty(self, lib):
        """Empty graph has no cycle."""
        g = lib.create_graph()
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is False
        assert result["cycle"] == []

    def test_no_cycle_single_node(self, lib):
        """Single node without self-loop has no cycle."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is False

    def test_cycle_self_loop(self, lib):
        """Self-loop is a cycle."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is True

    def test_cycle_triangle(self, lib):
        """Triangle forms a cycle."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is True

    def test_no_cycle_tree(self, lib):
        """Tree has no cycle (undirected without back edges)."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is False

    def test_cycle_in_directed(self, lib):
        """Cycle in directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is True

    def test_no_cycle_dag(self, lib):
        """DAG has no cycle."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        lib.add_edge(g["id"], "C", "D")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is False

    def test_cycle_returns_cycle_path(self, lib):
        """Cycle detection returns the cycle path."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.has_cycle(g["id"])
        assert result["has_cycle"] is True
        assert len(result["cycle"]) >= 3


class TestIsDAG:
    """Tests for is_dag."""

    def test_is_dag_true(self, lib):
        """Valid DAG."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "A", "C")
        result = lib.is_dag(g["id"])
        assert result["is_dag"] is True

    def test_is_dag_false_cycle(self, lib):
        """Graph with cycle is not DAG."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.is_dag(g["id"])
        assert result["is_dag"] is False

    def test_is_dag_undirected(self, lib):
        """Undirected graph is not a DAG."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        result = lib.is_dag(g["id"])
        assert result["is_dag"] is False

    def test_is_dag_empty(self, lib):
        """Empty directed graph is DAG."""
        g = lib.create_graph({"directed": True})
        result = lib.is_dag(g["id"])
        assert result["is_dag"] is True


class TestTopologicalSort:
    """Tests for topological_sort."""

    def test_topo_sort_linear(self, lib):
        """Topological sort of linear DAG."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.topological_sort(g["id"])
        assert result["success"] is True
        assert result["order"].index("A") < result["order"].index("B")
        assert result["order"].index("B") < result["order"].index("C")

    def test_topo_sort_diamond(self, lib):
        """Topological sort of diamond DAG."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        lib.add_edge(g["id"], "C", "D")
        result = lib.topological_sort(g["id"])
        assert result["success"] is True
        order = result["order"]
        assert order.index("A") < order.index("B")
        assert order.index("A") < order.index("C")
        assert order.index("B") < order.index("D")
        assert order.index("C") < order.index("D")

    def test_topo_sort_fails_on_cycle(self, lib):
        """Topological sort fails on graph with cycle."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.topological_sort(g["id"])
        assert result["success"] is False
        assert result["error"] == "not_a_dag"

    def test_topo_sort_fails_on_undirected(self, lib):
        """Topological sort fails on undirected graph."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        result = lib.topological_sort(g["id"])
        assert result["success"] is False
        assert result["error"] == "not_a_dag"

    def test_topo_sort_disconnected(self, lib):
        """Topological sort with disconnected components."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "C", "D")
        result = lib.topological_sort(g["id"])
        assert result["success"] is True
        assert len(result["order"]) == 4


class TestConnectedComponents:
    """Tests for connected_components."""

    def test_single_component(self, lib):
        """Single connected component."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.connected_components(g["id"])
        assert result["count"] == 1
        assert len(result["components"]) == 1
        assert set(result["components"][0]) == {"A", "B", "C"}

    def test_multiple_components(self, lib):
        """Multiple connected components."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "C", "D")
        lib.add_node(g["id"], "E")
        result = lib.connected_components(g["id"])
        assert result["count"] == 3

    def test_empty_graph_components(self, lib):
        """Empty graph has no components."""
        g = lib.create_graph()
        result = lib.connected_components(g["id"])
        assert result["count"] == 0
        assert result["components"] == []

    def test_isolated_nodes(self, lib):
        """Each isolated node is a component."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        lib.add_node(g["id"], "C")
        result = lib.connected_components(g["id"])
        assert result["count"] == 3


class TestStronglyConnectedComponents:
    """Tests for strongly_connected_components."""

    def test_scc_linear_directed(self, lib):
        """Linear directed graph: each node is own SCC."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.strongly_connected_components(g["id"])
        assert result["count"] == 3

    def test_scc_cycle(self, lib):
        """Cycle forms single SCC."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.strongly_connected_components(g["id"])
        assert result["count"] == 1
        assert set(result["components"][0]) == {"A", "B", "C"}

    def test_scc_multiple(self, lib):
        """Multiple SCCs."""
        g = lib.create_graph({"directed": True})
        # SCC 1: A <-> B
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "A")
        # SCC 2: C <-> D
        lib.add_edge(g["id"], "C", "D")
        lib.add_edge(g["id"], "D", "C")
        # Connection between SCCs
        lib.add_edge(g["id"], "B", "C")
        result = lib.strongly_connected_components(g["id"])
        assert result["count"] == 2

    def test_scc_undirected_same_as_cc(self, lib):
        """For undirected, SCC equals CC."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "C", "D")
        scc = lib.strongly_connected_components(g["id"])
        cc = lib.connected_components(g["id"])
        assert scc["count"] == cc["count"]


class TestIsConnected:
    """Tests for is_connected."""

    def test_is_connected_true(self, lib):
        """Connected graph."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.is_connected(g["id"])
        assert result["is_connected"] is True

    def test_is_connected_false(self, lib):
        """Disconnected graph."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_node(g["id"], "C")
        result = lib.is_connected(g["id"])
        assert result["is_connected"] is False

    def test_is_connected_single_node(self, lib):
        """Single node is connected."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.is_connected(g["id"])
        assert result["is_connected"] is True

    def test_is_connected_empty(self, lib):
        """Empty graph is considered connected."""
        g = lib.create_graph()
        result = lib.is_connected(g["id"])
        assert result["is_connected"] is True

    def test_is_connected_directed_weak(self, lib):
        """Directed graph: check weak connectivity."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.is_connected(g["id"])
        assert result["is_connected"] is True
