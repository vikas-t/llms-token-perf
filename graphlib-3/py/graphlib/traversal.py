"""BFS and DFS traversal implementations."""
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

        neighbors = sorted(graph.adjacency.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                queue.append((neighbor, level + 1))

    return {"order": order, "levels": levels, "parent": parent}


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
    time = [0]

    def dfs_visit(node: str):
        visited.add(node)
        discovery[node] = time[0]
        time[0] += 1
        order.append(node)

        neighbors = sorted(graph.adjacency.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                parent[neighbor] = node
                dfs_visit(neighbor)

        finish[node] = time[0]
        time[0] += 1

    dfs_visit(start_node)

    return {"order": order, "discovery": discovery, "finish": finish, "parent": parent}
