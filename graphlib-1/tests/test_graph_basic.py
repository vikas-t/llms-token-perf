"""Tests for basic graph operations: creation, add/remove nodes and edges."""
import pytest


class TestCreateGraph:
    """Tests for graph creation."""

    def test_create_undirected_unweighted(self, lib):
        """Create default undirected unweighted graph."""
        result = lib.create_graph()
        assert "id" in result
        assert result["directed"] is False
        assert result["weighted"] is False
        assert result["node_count"] == 0
        assert result["edge_count"] == 0

    def test_create_directed(self, lib):
        """Create directed graph."""
        result = lib.create_graph({"directed": True})
        assert result["directed"] is True
        assert result["weighted"] is False

    def test_create_weighted(self, lib):
        """Create weighted graph."""
        result = lib.create_graph({"weighted": True})
        assert result["directed"] is False
        assert result["weighted"] is True

    def test_create_directed_weighted(self, lib):
        """Create directed weighted graph."""
        result = lib.create_graph({"directed": True, "weighted": True})
        assert result["directed"] is True
        assert result["weighted"] is True

    def test_create_multiple_graphs(self, lib):
        """Create multiple graphs with unique IDs."""
        g1 = lib.create_graph()
        g2 = lib.create_graph()
        g3 = lib.create_graph()
        assert g1["id"] != g2["id"]
        assert g2["id"] != g3["id"]
        assert g1["id"] != g3["id"]


class TestAddNode:
    """Tests for adding nodes."""

    def test_add_single_node(self, lib):
        """Add a single node."""
        g = lib.create_graph()
        result = lib.add_node(g["id"], "A")
        assert result["success"] is True
        assert result["node_id"] == "A"

    def test_add_multiple_nodes(self, lib):
        """Add multiple nodes."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        lib.add_node(g["id"], "C")
        nodes = lib.get_nodes(g["id"])
        assert nodes["count"] == 3
        assert set(nodes["nodes"]) == {"A", "B", "C"}

    def test_add_duplicate_node(self, lib):
        """Adding duplicate node should fail."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.add_node(g["id"], "A")
        assert result["success"] is False
        assert result["error"] == "node_already_exists"

    def test_add_node_numeric_string(self, lib):
        """Add node with numeric string ID."""
        g = lib.create_graph()
        result = lib.add_node(g["id"], "123")
        assert result["success"] is True
        assert result["node_id"] == "123"

    def test_add_node_special_chars(self, lib):
        """Add node with special characters."""
        g = lib.create_graph()
        result = lib.add_node(g["id"], "node_1")
        assert result["success"] is True


class TestAddEdge:
    """Tests for adding edges."""

    def test_add_edge_undirected(self, lib):
        """Add edge in undirected graph."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.add_edge(g["id"], "A", "B")
        assert result["success"] is True
        assert result["from"] == "A"
        assert result["to"] == "B"

    def test_add_edge_creates_nodes(self, lib):
        """Adding edge auto-creates nodes if they don't exist."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "X", "Y")
        nodes = lib.get_nodes(g["id"])
        assert set(nodes["nodes"]) == {"X", "Y"}

    def test_add_edge_directed(self, lib):
        """Add edge in directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        # In directed graph, A->B exists but B->A doesn't
        assert lib.has_edge(g["id"], "A", "B")["exists"] is True
        assert lib.has_edge(g["id"], "B", "A")["exists"] is False

    def test_add_edge_undirected_bidirectional(self, lib):
        """In undirected graph, edge exists in both directions."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        assert lib.has_edge(g["id"], "A", "B")["exists"] is True
        assert lib.has_edge(g["id"], "B", "A")["exists"] is True

    def test_add_weighted_edge(self, lib):
        """Add weighted edge."""
        g = lib.create_graph({"weighted": True})
        result = lib.add_edge(g["id"], "A", "B", 5.5)
        assert result["weight"] == 5.5

    def test_add_edge_default_weight(self, lib):
        """Edge without weight defaults to 1.0."""
        g = lib.create_graph({"weighted": True})
        result = lib.add_edge(g["id"], "A", "B")
        assert result["weight"] == 1.0

    def test_add_duplicate_edge(self, lib):
        """Adding duplicate edge should fail."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.add_edge(g["id"], "A", "B")
        assert result["success"] is False
        assert result["error"] == "edge_already_exists"

    def test_add_self_loop(self, lib):
        """Add self-loop (edge from node to itself)."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.add_edge(g["id"], "A", "A")
        assert result["success"] is True

    def test_add_negative_weight(self, lib):
        """Add edge with negative weight."""
        g = lib.create_graph({"weighted": True})
        result = lib.add_edge(g["id"], "A", "B", -2.5)
        assert result["success"] is True
        assert result["weight"] == -2.5


class TestRemoveNode:
    """Tests for removing nodes."""

    def test_remove_node(self, lib):
        """Remove a node."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.remove_node(g["id"], "A")
        assert result["success"] is True
        nodes = lib.get_nodes(g["id"])
        assert "A" not in nodes["nodes"]
        assert "B" in nodes["nodes"]

    def test_remove_node_removes_edges(self, lib):
        """Removing node removes incident edges."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "C")
        result = lib.remove_node(g["id"], "A")
        assert result["removed_edges"] == 2
        edges = lib.get_edges(g["id"])
        assert edges["count"] == 1

    def test_remove_nonexistent_node(self, lib):
        """Removing nonexistent node should fail."""
        g = lib.create_graph()
        result = lib.remove_node(g["id"], "X")
        assert result["success"] is False
        assert result["error"] == "node_not_found"

    def test_remove_node_with_self_loop(self, lib):
        """Remove node that has a self-loop."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        lib.add_edge(g["id"], "A", "B")
        result = lib.remove_node(g["id"], "A")
        assert result["success"] is True
        assert result["removed_edges"] >= 2


class TestRemoveEdge:
    """Tests for removing edges."""

    def test_remove_edge(self, lib):
        """Remove an edge."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.remove_edge(g["id"], "A", "B")
        assert result["success"] is True
        assert lib.has_edge(g["id"], "A", "B")["exists"] is False

    def test_remove_edge_undirected(self, lib):
        """Remove edge in undirected graph removes both directions."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        lib.remove_edge(g["id"], "A", "B")
        assert lib.has_edge(g["id"], "A", "B")["exists"] is False
        assert lib.has_edge(g["id"], "B", "A")["exists"] is False

    def test_remove_edge_directed(self, lib):
        """Remove edge in directed graph only removes one direction."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "A")
        lib.remove_edge(g["id"], "A", "B")
        assert lib.has_edge(g["id"], "A", "B")["exists"] is False
        assert lib.has_edge(g["id"], "B", "A")["exists"] is True

    def test_remove_nonexistent_edge(self, lib):
        """Removing nonexistent edge should fail."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.remove_edge(g["id"], "A", "B")
        assert result["success"] is False
        assert result["error"] == "edge_not_found"

    def test_remove_edge_keeps_nodes(self, lib):
        """Removing edge keeps nodes intact."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.remove_edge(g["id"], "A", "B")
        nodes = lib.get_nodes(g["id"])
        assert set(nodes["nodes"]) == {"A", "B"}
