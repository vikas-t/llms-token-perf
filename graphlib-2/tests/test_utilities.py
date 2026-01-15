"""Tests for utility functions and edge cases."""
import pytest


class TestGetGraphInfo:
    """Tests for get_graph_info."""

    def test_info_empty_graph(self, lib):
        """Info for empty graph."""
        g = lib.create_graph()
        result = lib.get_graph_info(g["id"])
        assert result["id"] == g["id"]
        assert result["node_count"] == 0
        assert result["edge_count"] == 0

    def test_info_with_nodes_edges(self, lib):
        """Info for graph with nodes and edges."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.get_graph_info(g["id"])
        assert result["node_count"] == 3
        assert result["edge_count"] == 2

    def test_info_directed(self, lib):
        """Info shows directed flag."""
        g = lib.create_graph({"directed": True})
        result = lib.get_graph_info(g["id"])
        assert result["directed"] is True

    def test_info_weighted(self, lib):
        """Info shows weighted flag."""
        g = lib.create_graph({"weighted": True})
        result = lib.get_graph_info(g["id"])
        assert result["weighted"] is True

    def test_info_connectivity(self, lib):
        """Info includes connectivity status."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        result = lib.get_graph_info(g["id"])
        assert "is_connected" in result

    def test_info_cycle(self, lib):
        """Info includes cycle status."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.get_graph_info(g["id"])
        assert result["has_cycle"] is True


class TestClearGraph:
    """Tests for clear_graph."""

    def test_clear_removes_all(self, lib):
        """Clear removes all nodes and edges."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.clear_graph(g["id"])
        assert result["success"] is True
        nodes = lib.get_nodes(g["id"])
        assert nodes["count"] == 0
        edges = lib.get_edges(g["id"])
        assert edges["count"] == 0

    def test_clear_empty_graph(self, lib):
        """Clear on empty graph succeeds."""
        g = lib.create_graph()
        result = lib.clear_graph(g["id"])
        assert result["success"] is True

    def test_clear_preserves_properties(self, lib):
        """Clear preserves graph type."""
        g = lib.create_graph({"directed": True, "weighted": True})
        lib.add_edge(g["id"], "A", "B", 5)
        lib.clear_graph(g["id"])
        info = lib.get_graph_info(g["id"])
        assert info["directed"] is True
        assert info["weighted"] is True


class TestCloneGraph:
    """Tests for clone_graph."""

    def test_clone_creates_copy(self, lib):
        """Clone creates independent copy."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        clone = lib.clone_graph(g["id"])
        assert clone["id"] != g["id"]
        assert clone["node_count"] == 3
        assert clone["edge_count"] == 2

    def test_clone_independent(self, lib):
        """Changes to clone don't affect original."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        clone = lib.clone_graph(g["id"])
        lib.add_node(clone["id"], "C")
        original_nodes = lib.get_nodes(g["id"])
        clone_nodes = lib.get_nodes(clone["id"])
        assert original_nodes["count"] == 2
        assert clone_nodes["count"] == 3

    def test_clone_preserves_weights(self, lib):
        """Clone preserves edge weights."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 5.5)
        clone = lib.clone_graph(g["id"])
        edge = lib.has_edge(clone["id"], "A", "B")
        assert edge["weight"] == 5.5

    def test_clone_preserves_type(self, lib):
        """Clone preserves directed/weighted flags."""
        g = lib.create_graph({"directed": True, "weighted": True})
        clone = lib.clone_graph(g["id"])
        assert clone["directed"] is True
        assert clone["weighted"] is True


class TestSubgraph:
    """Tests for subgraph."""

    def test_subgraph_subset(self, lib):
        """Subgraph with subset of nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "D")
        sub = lib.subgraph(g["id"], ["A", "B", "C"])
        assert sub["node_count"] == 3
        assert sub["edge_count"] == 2

    def test_subgraph_includes_internal_edges(self, lib):
        """Subgraph includes edges between selected nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "C")
        sub = lib.subgraph(g["id"], ["A", "B"])
        sub_edges = lib.get_edges(sub["id"])
        assert sub_edges["count"] == 1

    def test_subgraph_excludes_external_edges(self, lib):
        """Subgraph excludes edges to non-selected nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        sub = lib.subgraph(g["id"], ["A", "B"])
        # B-C edge excluded because C not in subgraph
        assert lib.has_edge(sub["id"], "B", "C")["exists"] is False

    def test_subgraph_empty(self, lib):
        """Subgraph with no nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        sub = lib.subgraph(g["id"], [])
        assert sub["node_count"] == 0
        assert sub["edge_count"] == 0

    def test_subgraph_preserves_weights(self, lib):
        """Subgraph preserves edge weights."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 3.5)
        sub = lib.subgraph(g["id"], ["A", "B"])
        edge = lib.has_edge(sub["id"], "A", "B")
        assert edge["weight"] == 3.5


class TestLargeGraphs:
    """Tests for larger graphs."""

    def test_large_node_count(self, lib):
        """Handle graph with many nodes."""
        g = lib.create_graph()
        for i in range(100):
            lib.add_node(g["id"], str(i))
        nodes = lib.get_nodes(g["id"])
        assert nodes["count"] == 100

    def test_large_edge_count(self, lib):
        """Handle graph with many edges."""
        g = lib.create_graph()
        # Create fully connected graph of 20 nodes
        for i in range(20):
            for j in range(i + 1, 20):
                lib.add_edge(g["id"], str(i), str(j))
        edges = lib.get_edges(g["id"])
        assert edges["count"] == 190  # 20*19/2

    def test_bfs_large_graph(self, lib):
        """BFS on larger graph."""
        g = lib.create_graph()
        # Linear chain of 50 nodes
        for i in range(49):
            lib.add_edge(g["id"], str(i), str(i + 1))
        result = lib.bfs(g["id"], "0")
        assert len(result["order"]) == 50
        assert result["levels"]["49"] == 49

    def test_dijkstra_large_graph(self, lib):
        """Dijkstra on larger weighted graph."""
        g = lib.create_graph({"weighted": True})
        for i in range(49):
            lib.add_edge(g["id"], str(i), str(i + 1), 1.0)
        result = lib.shortest_path(g["id"], "0", "49")
        assert result["exists"] is True
        assert result["distance"] == 49


class TestEdgeCases:
    """Miscellaneous edge cases."""

    def test_unicode_node_names(self, lib):
        """Handle unicode node names."""
        g = lib.create_graph()
        lib.add_node(g["id"], "节点")
        lib.add_node(g["id"], "узел")
        result = lib.get_nodes(g["id"])
        assert "节点" in result["nodes"]
        assert "узел" in result["nodes"]

    def test_long_node_name(self, lib):
        """Handle long node names."""
        g = lib.create_graph()
        long_name = "a" * 100
        lib.add_node(g["id"], long_name)
        result = lib.has_node(g["id"], long_name)
        assert result["exists"] is True

    def test_graph_with_only_edges(self, lib):
        """Graph created by adding edges only."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        nodes = lib.get_nodes(g["id"])
        assert nodes["count"] == 3

    def test_remove_all_edges_keeps_nodes(self, lib):
        """Removing all edges keeps nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.remove_edge(g["id"], "A", "B")
        nodes = lib.get_nodes(g["id"])
        assert nodes["count"] == 2

    def test_float_weights_precision(self, lib):
        """Float weights maintain precision."""
        g = lib.create_graph({"weighted": True})
        lib.add_edge(g["id"], "A", "B", 0.1)
        lib.add_edge(g["id"], "B", "C", 0.2)
        result = lib.shortest_path(g["id"], "A", "C")
        assert abs(result["distance"] - 0.3) < 0.0001
