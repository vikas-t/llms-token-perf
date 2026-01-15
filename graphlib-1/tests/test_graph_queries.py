"""Tests for graph query operations."""
import pytest


class TestGetNodes:
    """Tests for get_nodes."""

    def test_get_nodes_empty(self, lib):
        """Get nodes from empty graph."""
        g = lib.create_graph()
        result = lib.get_nodes(g["id"])
        assert result["nodes"] == []
        assert result["count"] == 0

    def test_get_nodes_single(self, lib):
        """Get single node."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.get_nodes(g["id"])
        assert result["nodes"] == ["A"]
        assert result["count"] == 1

    def test_get_nodes_multiple(self, lib):
        """Get multiple nodes."""
        g = lib.create_graph()
        lib.add_node(g["id"], "C")
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.get_nodes(g["id"])
        assert result["count"] == 3
        assert set(result["nodes"]) == {"A", "B", "C"}


class TestGetEdges:
    """Tests for get_edges."""

    def test_get_edges_empty(self, lib):
        """Get edges from graph with no edges."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.get_edges(g["id"])
        assert result["edges"] == []
        assert result["count"] == 0

    def test_get_edges_single(self, lib):
        """Get single edge."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.get_edges(g["id"])
        assert result["count"] == 1
        assert result["edges"][0]["from"] == "A"
        assert result["edges"][0]["to"] == "B"

    def test_get_edges_weighted(self, lib):
        """Get edges with weights."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 3.5)
        result = lib.get_edges(g["id"])
        assert result["edges"][0]["weight"] == 3.5

    def test_get_edges_directed(self, lib):
        """Get edges from directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.get_edges(g["id"])
        assert result["count"] == 2

    def test_get_edges_undirected(self, lib):
        """Get edges from undirected graph (each edge listed once)."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        result = lib.get_edges(g["id"])
        # Undirected edge should be listed once
        assert result["count"] == 1


class TestGetNeighbors:
    """Tests for get_neighbors."""

    def test_get_neighbors_none(self, lib):
        """Get neighbors of isolated node."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.get_neighbors(g["id"], "A")
        assert result["neighbors"] == []
        assert result["count"] == 0

    def test_get_neighbors_single(self, lib):
        """Get single neighbor."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.get_neighbors(g["id"], "A")
        assert result["neighbors"] == ["B"]
        assert result["count"] == 1

    def test_get_neighbors_multiple(self, lib):
        """Get multiple neighbors."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "A", "D")
        result = lib.get_neighbors(g["id"], "A")
        assert result["count"] == 3
        assert set(result["neighbors"]) == {"B", "C", "D"}

    def test_get_neighbors_directed(self, lib):
        """Get neighbors in directed graph (outgoing only)."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "C", "A")
        result = lib.get_neighbors(g["id"], "A")
        assert result["neighbors"] == ["B"]
        assert result["count"] == 1

    def test_get_neighbors_undirected(self, lib):
        """Get neighbors in undirected graph."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "C", "A")
        result = lib.get_neighbors(g["id"], "A")
        assert result["count"] == 2
        assert set(result["neighbors"]) == {"B", "C"}

    def test_get_neighbors_self_loop(self, lib):
        """Neighbors include self-loop."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        lib.add_edge(g["id"], "A", "B")
        result = lib.get_neighbors(g["id"], "A")
        assert "A" in result["neighbors"]
        assert "B" in result["neighbors"]


class TestHasNode:
    """Tests for has_node."""

    def test_has_node_true(self, lib):
        """Node exists."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.has_node(g["id"], "A")
        assert result["exists"] is True

    def test_has_node_false(self, lib):
        """Node does not exist."""
        g = lib.create_graph()
        result = lib.has_node(g["id"], "X")
        assert result["exists"] is False

    def test_has_node_after_removal(self, lib):
        """Node no longer exists after removal."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.remove_node(g["id"], "A")
        result = lib.has_node(g["id"], "A")
        assert result["exists"] is False


class TestHasEdge:
    """Tests for has_edge."""

    def test_has_edge_true(self, lib):
        """Edge exists."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.has_edge(g["id"], "A", "B")
        assert result["exists"] is True

    def test_has_edge_false(self, lib):
        """Edge does not exist."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.has_edge(g["id"], "A", "B")
        assert result["exists"] is False

    def test_has_edge_with_weight(self, lib):
        """Has edge returns weight."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 2.5)
        result = lib.has_edge(g["id"], "A", "B")
        assert result["exists"] is True
        assert result["weight"] == 2.5

    def test_has_edge_directed_one_way(self, lib):
        """In directed graph, edge only exists one way."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        assert lib.has_edge(g["id"], "A", "B")["exists"] is True
        assert lib.has_edge(g["id"], "B", "A")["exists"] is False

    def test_has_edge_self_loop(self, lib):
        """Check self-loop edge."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        result = lib.has_edge(g["id"], "A", "A")
        assert result["exists"] is True


class TestGetDegree:
    """Tests for get_degree."""

    def test_get_degree_zero(self, lib):
        """Degree of isolated node is zero."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.get_degree(g["id"], "A")
        assert result["degree"] == 0

    def test_get_degree_undirected(self, lib):
        """Degree in undirected graph."""
        g = lib.create_graph({"directed": False})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        result = lib.get_degree(g["id"], "A")
        assert result["degree"] == 2
        assert result["in_degree"] == 2
        assert result["out_degree"] == 2

    def test_get_degree_directed(self, lib):
        """Degree in directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")  # out
        lib.add_edge(g["id"], "A", "C")  # out
        lib.add_edge(g["id"], "D", "A")  # in
        result = lib.get_degree(g["id"], "A")
        assert result["out_degree"] == 2
        assert result["in_degree"] == 1
        assert result["degree"] == 3

    def test_get_degree_self_loop(self, lib):
        """Self-loop counts toward degree."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        result = lib.get_degree(g["id"], "A")
        # Self-loop typically counts as 2 in undirected, but could count as 1
        assert result["degree"] >= 1
