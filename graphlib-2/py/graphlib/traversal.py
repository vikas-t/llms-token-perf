"""Graph traversal algorithms: BFS and DFS."""
from typing import Dict, List, Any
from collections import deque
from .types import get_graph


def bfs(graph_id: str, start_node: str) -> Dict[str, Any]:
    """Breadth-first search traversal."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"order": [], "levels": {}, "parent": {}}

    if start_node not in graph.nodes:
        return {"order": [], "levels": {}, "parent": {}}

    order = []
    levels = {}
    parent = {}
    visited = set()

    queue = deque([(start_node, 0)])
    visited.add(start_node)

    while queue:
        node, level = queue.popleft()
        order.append(node)
        levels[node] = level

        # Get neighbors in sorted order for deterministic results
        neighbors = sorted(graph.adj.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                queue.append((neighbor, level + 1))

    return {
        "order": order,
        "levels": levels,
        "parent": parent
    }


def dfs(graph_id: str, start_node: str) -> Dict[str, Any]:
    """Depth-first search traversal."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"order": [], "discovery": {}, "finish": {}, "parent": {}}

    if start_node not in graph.nodes:
        return {"order": [], "discovery": {}, "finish": {}, "parent": {}}

    order = []
    discovery = {}
    finish = {}
    parent = {}
    visited = set()
    time = [0]  # Use list to allow modification in nested function

    def dfs_visit(node: str) -> None:
        visited.add(node)
        order.append(node)
        discovery[node] = time[0]
        time[0] += 1

        # Get neighbors in sorted order for deterministic results
        neighbors = sorted(graph.adj.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                parent[neighbor] = node
                dfs_visit(neighbor)

        finish[node] = time[0]
        time[0] += 1

    dfs_visit(start_node)

    return {
        "order": order,
        "discovery": discovery,
        "finish": finish,
        "parent": parent
    }
