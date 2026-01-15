"""Tests for graph traversal algorithms: BFS and DFS."""
import pytest


class TestBFS:
    """Tests for breadth-first search."""

    def test_bfs_single_node(self, lib):
        """BFS on single node graph."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.bfs(g["id"], "A")
        assert result["order"] == ["A"]
        assert result["levels"]["A"] == 0
        assert "A" not in result["parent"]

    def test_bfs_linear_graph(self, lib):
        """BFS on linear graph A-B-C-D."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "D")
        result = lib.bfs(g["id"], "A")
        assert result["order"] == ["A", "B", "C", "D"]
        assert result["levels"]["A"] == 0
        assert result["levels"]["B"] == 1
        assert result["levels"]["C"] == 2
        assert result["levels"]["D"] == 3

    def test_bfs_tree_structure(self, lib):
        """BFS on tree structure."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        lib.add_edge(g["id"], "B", "E")
        result = lib.bfs(g["id"], "A")
        assert result["order"][0] == "A"
        # B and C at same level
        assert result["levels"]["B"] == 1
        assert result["levels"]["C"] == 1
        # D and E at level 2
        assert result["levels"]["D"] == 2
        assert result["levels"]["E"] == 2

    def test_bfs_parent_tracking(self, lib):
        """BFS tracks parent correctly."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        result = lib.bfs(g["id"], "A")
        assert result["parent"]["B"] == "A"
        assert result["parent"]["C"] == "A"
        assert result["parent"]["D"] == "B"

    def test_bfs_directed_graph(self, lib):
        """BFS on directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")  # Back edge
        result = lib.bfs(g["id"], "A")
        assert "A" in result["order"]
        assert "B" in result["order"]
        assert "C" in result["order"]
        assert result["levels"]["A"] == 0

    def test_bfs_disconnected_starts_at_node(self, lib):
        """BFS only visits reachable nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_node(g["id"], "C")  # Disconnected
        result = lib.bfs(g["id"], "A")
        assert "C" not in result["order"]
        assert "C" not in result["levels"]

    def test_bfs_cycle(self, lib):
        """BFS handles cycles correctly."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.bfs(g["id"], "A")
        assert len(result["order"]) == 3
        assert set(result["order"]) == {"A", "B", "C"}


class TestDFS:
    """Tests for depth-first search."""

    def test_dfs_single_node(self, lib):
        """DFS on single node graph."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.dfs(g["id"], "A")
        assert result["order"] == ["A"]
        assert result["discovery"]["A"] == 0

    def test_dfs_linear_graph(self, lib):
        """DFS on linear graph A-B-C-D."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "D")
        result = lib.dfs(g["id"], "A")
        assert result["order"] == ["A", "B", "C", "D"]

    def test_dfs_discovery_finish_times(self, lib):
        """DFS tracks discovery and finish times."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.dfs(g["id"], "A")
        # Finish time should be after discovery time
        assert result["finish"]["A"] > result["discovery"]["A"]
        assert result["finish"]["B"] > result["discovery"]["B"]
        assert result["finish"]["C"] > result["discovery"]["C"]
        # C finishes before B (nested)
        assert result["finish"]["C"] < result["finish"]["B"]

    def test_dfs_parent_tracking(self, lib):
        """DFS tracks parent correctly."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        result = lib.dfs(g["id"], "A")
        assert result["parent"]["B"] == "A"
        assert result["parent"]["C"] == "B"

    def test_dfs_directed_graph(self, lib):
        """DFS on directed graph."""
        g = lib.create_graph({"directed": True})
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        result = lib.dfs(g["id"], "A")
        assert "A" in result["order"]
        assert "B" in result["order"]
        assert "C" in result["order"]
        assert "D" in result["order"]

    def test_dfs_disconnected_starts_at_node(self, lib):
        """DFS only visits reachable nodes."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_node(g["id"], "C")  # Disconnected
        result = lib.dfs(g["id"], "A")
        assert "C" not in result["order"]

    def test_dfs_cycle(self, lib):
        """DFS handles cycles correctly."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "B", "C")
        lib.add_edge(g["id"], "C", "A")
        result = lib.dfs(g["id"], "A")
        assert len(result["order"]) == 3
        assert set(result["order"]) == {"A", "B", "C"}

    def test_dfs_branching(self, lib):
        """DFS on branching graph explores deeply first."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "B")
        lib.add_edge(g["id"], "A", "C")
        lib.add_edge(g["id"], "B", "D")
        result = lib.dfs(g["id"], "A")
        # After A, should go deep (B then D) before backtracking to C
        a_idx = result["order"].index("A")
        b_idx = result["order"].index("B")
        d_idx = result["order"].index("D")
        # B should come before D, and both before we finish A's subtree
        assert a_idx < b_idx < d_idx


class TestTraversalEdgeCases:
    """Edge cases for traversal algorithms."""

    def test_bfs_empty_graph(self, lib):
        """BFS from node in otherwise empty graph."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.bfs(g["id"], "A")
        assert result["order"] == ["A"]

    def test_dfs_empty_graph(self, lib):
        """DFS from node in otherwise empty graph."""
        g = lib.create_graph()
        lib.add_node(g["id"], "A")
        result = lib.dfs(g["id"], "A")
        assert result["order"] == ["A"]

    def test_bfs_self_loop(self, lib):
        """BFS handles self-loop."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        lib.add_edge(g["id"], "A", "B")
        result = lib.bfs(g["id"], "A")
        assert "A" in result["order"]
        assert "B" in result["order"]

    def test_dfs_self_loop(self, lib):
        """DFS handles self-loop."""
        g = lib.create_graph()
        lib.add_edge(g["id"], "A", "A")
        lib.add_edge(g["id"], "A", "B")
        result = lib.dfs(g["id"], "A")
        assert "A" in result["order"]
        assert "B" in result["order"]
