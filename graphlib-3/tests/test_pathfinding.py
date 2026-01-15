"""Tests for pathfinding algorithms."""
import pytest


class TestShortestPath:
    """Tests for shortest_path."""

    def test_shortest_path_same_node(self, lib):
        """Shortest path from node to itself."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.shortest_path(g["id"], "A", "A")
        assert result["exists"] is True
        assert result["path"] == ["A"]
        assert result["distance"] == 0

    def test_shortest_path_direct_edge(self, lib):
        """Shortest path with direct edge."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.shortest_path(g["id"], "A", "B")
        assert result["exists"] is True
        assert result["path"] == ["A", "B"]
        assert result["distance"] == 1

    def test_shortest_path_multiple_hops(self, lib):
        """Shortest path through multiple nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "D")
        result = lib.shortest_path(g["id"], "A", "D")
        assert result["exists"] is True
        assert result["path"] == ["A", "B", "C", "D"]
        assert result["distance"] == 3

    def test_shortest_path_chooses_shorter(self, lib):
        """Shortest path chooses shorter route."""
        g = lib.create_graph()
        # Long path: A -> B -> C -> D
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "D")
        # Short path: A -> D
        lib.add_edge(g["id"], "A", "D")
        result = lib.shortest_path(g["id"], "A", "D")
        assert result["path"] == ["A", "D"]
        assert result["distance"] == 1

    def test_shortest_path_no_path(self, lib):
        """No path exists between nodes."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.shortest_path(g["id"], "A", "B")
        assert result["exists"] is False
        assert result["path"] == []
        assert result["distance"] == -1

    def test_shortest_path_directed_no_path(self, lib):
        """No path in directed graph (wrong direction)."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        result = lib.shortest_path(g["id"], "B", "A")
        assert result["exists"] is False

    def test_shortest_path_weighted(self, lib):
        """Shortest path in weighted graph."""
        g = lib.create_graph({"weighted": True})
        # Path 1: A -> B (weight 1) -> C (weight 1) = 2
        lib.add_edge(g["id"], "A", "B", 1)
        lib.add_edge(g["id"], "B", "C", 1)
        # Path 2: A -> C (weight 5) = 5
        lib.add_edge(g["id"], "A", "C", 5)
        result = lib.shortest_path(g["id"], "A", "C")
        assert result["path"] == ["A", "B", "C"]
        assert result["distance"] == 2

    def test_shortest_path_weighted_prefers_direct(self, lib):
        """Weighted path prefers direct if cheaper."""
        g = lib.create_graph({"weighted": True})
        # Path 1: A -> B (weight 10) -> C (weight 10) = 20
        lib.add_edge(g["id"], "A", "B", 10)
        lib.add_edge(g["id"], "B", "C", 10)
        # Path 2: A -> C (weight 5) = 5
        lib.add_edge(g["id"], "A", "C", 5)
        result = lib.shortest_path(g["id"], "A", "C")
        assert result["path"] == ["A", "C"]
        assert result["distance"] == 5


class TestAllShortestPaths:
    """Tests for all_shortest_paths."""

    def test_all_shortest_paths_single_node(self, lib):
        """All paths from isolated node."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.all_shortest_paths(g["id"], "A")
        assert result["distances"]["A"] == 0
        assert result["paths"]["A"] == ["A"]

    def test_all_shortest_paths_connected(self, lib):
        """All paths in connected graph."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.all_shortest_paths(g["id"], "A")
        assert result["distances"]["A"] == 0
        assert result["distances"]["B"] == 1
        assert result["distances"]["C"] == 2
        assert result["paths"]["A"] == ["A"]
        assert result["paths"]["B"] == ["A", "B"]
        assert result["paths"]["C"] == ["A", "B", "C"]

    def test_all_shortest_paths_unreachable(self, lib):
        """Track unreachable nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_node(g["id"], "C")  # Disconnected
        result = lib.all_shortest_paths(g["id"], "A")
        assert "C" in result["unreachable"]
        assert "C" not in result["distances"]

    def test_all_shortest_paths_weighted(self, lib):
        """All paths with weights."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 2)
        lib.add_edge(g["id"], "A", "C", 5)
        lib.add_edge(g["id"], "B", "C", 1)
        result = lib.all_shortest_paths(g["id"], "A")
        assert result["distances"]["B"] == 2
        assert result["distances"]["C"] == 3  # A->B->C = 2+1 = 3


class TestHasPath:
    """Tests for has_path."""

    def test_has_path_true(self, lib):
        """Path exists."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.has_path(g["id"], "A", "C")
        assert result["exists"] is True

    def test_has_path_false(self, lib):
        """Path does not exist."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        lib.add_node(g["id"], "B")
        result = lib.has_path(g["id"], "A", "B")
        assert result["exists"] is False

    def test_has_path_same_node(self, lib):
        """Path from node to itself."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.has_path(g["id"], "A", "A")
        assert result["exists"] is True

    def test_has_path_directed_one_way(self, lib):
        """Path in directed graph is one-way."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        assert lib.has_path(g["id"], "A", "B")["exists"] is True
        assert lib.has_path(g["id"], "B", "A")["exists"] is False

    def test_has_path_through_cycle(self, lib):
        """Path through cycle."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.has_path(g["id"], "A", "C")
        assert result["exists"] is True


class TestPathfindingEdgeCases:
    """Edge cases for pathfinding."""

    def test_path_with_self_loop(self, lib):
        """Path in graph with self-loops."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        lib.add_edge(g["id"], "A", "B")
        result = lib.shortest_path(g["id"], "A", "B")
        assert result["exists"] is True
        assert result["path"] == ["A", "B"]

    def test_shortest_path_large_graph(self, lib):
        """Shortest path in larger graph."""
        g = lib.create_graph()
        # Create a chain: 0 -> 1 -> 2 -> ... -> 9
        for i in range(9):
            lib.add_edge(g["id"], str(i), str(i + 1))
        result = lib.shortest_path(g["id"], "0", "9")
        assert result["exists"] is True
        assert len(result["path"]) == 10
        assert result["distance"] == 9

    def test_dijkstra_with_zero_weight(self, lib):
        """Dijkstra handles zero weight edges."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 0)
        lib.add_edge(g["id"], "B", "C", 1)
        result = lib.shortest_path(g["id"], "A", "C")
        assert result["distance"] == 1
