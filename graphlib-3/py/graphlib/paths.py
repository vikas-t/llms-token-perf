"""Pathfinding algorithms: shortest path, Dijkstra, has_path."""
from typing import Dict, List, Any
from collections import deque
import heapq
from .types import get_graph


def shortest_path(graph_id: str, start_node: str, end_node: str) -> Dict[str, Any]:
    """Find shortest path between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"exists": False, "path": [], "distance": -1}

    if start_node not in graph.nodes or end_node not in graph.nodes:
        return {"exists": False, "path": [], "distance": -1}

    if start_node == end_node:
        return {"exists": True, "path": [start_node], "distance": 0}

    if graph.weighted:
        return _dijkstra_single(graph, start_node, end_node)
    else:
        return _bfs_path(graph, start_node, end_node)


def _bfs_path(graph, start_node: str, end_node: str) -> Dict[str, Any]:
    """BFS-based shortest path for unweighted graphs."""
    visited = {start_node}
    parent = {}
    queue = deque([start_node])

    while queue:
        node = queue.popleft()
        if node == end_node:
            path = _reconstruct_path(parent, start_node, end_node)
            return {"exists": True, "path": path, "distance": len(path) - 1}

        neighbors = sorted(graph.adjacency.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                queue.append(neighbor)

    return {"exists": False, "path": [], "distance": -1}


def _dijkstra_single(graph, start_node: str, end_node: str) -> Dict[str, Any]:
    """Dijkstra's algorithm for weighted graphs."""
    distances = {start_node: 0}
    parent = {}
    pq = [(0, start_node)]
    visited = set()

    while pq:
        dist, node = heapq.heappop(pq)

        if node in visited:
            continue
        visited.add(node)

        if node == end_node:
            path = _reconstruct_path(parent, start_node, end_node)
            return {"exists": True, "path": path, "distance": dist}

        for neighbor, weight in graph.adjacency.get(node, {}).items():
            if neighbor not in visited:
                new_dist = dist + weight
                if neighbor not in distances or new_dist < distances[neighbor]:
                    distances[neighbor] = new_dist
                    parent[neighbor] = node
                    heapq.heappush(pq, (new_dist, neighbor))

    return {"exists": False, "path": [], "distance": -1}


def _reconstruct_path(parent: Dict[str, str], start: str, end: str) -> List[str]:
    """Reconstruct path from parent dict."""
    path = [end]
    current = end
    while current != start:
        current = parent[current]
        path.append(current)
    path.reverse()
    return path


def all_shortest_paths(graph_id: str, start_node: str) -> Dict[str, Any]:
    """Find shortest paths from start node to all reachable nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"distances": {}, "paths": {}, "unreachable": []}

    if start_node not in graph.nodes:
        return {"distances": {}, "paths": {}, "unreachable": list(graph.nodes)}

    if graph.weighted:
        return _dijkstra_all(graph, start_node)
    else:
        return _bfs_all(graph, start_node)


def _bfs_all(graph, start_node: str) -> Dict[str, Any]:
    """BFS-based all shortest paths for unweighted graphs."""
    distances = {start_node: 0}
    paths = {start_node: [start_node]}
    parent = {}
    queue = deque([start_node])
    visited = {start_node}

    while queue:
        node = queue.popleft()
        neighbors = sorted(graph.adjacency.get(node, {}).keys())
        for neighbor in neighbors:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                distances[neighbor] = distances[node] + 1
                paths[neighbor] = paths[node] + [neighbor]
                queue.append(neighbor)

    unreachable = [n for n in graph.nodes if n not in distances]
    return {"distances": distances, "paths": paths, "unreachable": sorted(unreachable)}


def _dijkstra_all(graph, start_node: str) -> Dict[str, Any]:
    """Dijkstra's algorithm for all shortest paths."""
    distances = {start_node: 0}
    parent = {}
    pq = [(0, start_node)]
    visited = set()

    while pq:
        dist, node = heapq.heappop(pq)

        if node in visited:
            continue
        visited.add(node)

        for neighbor, weight in graph.adjacency.get(node, {}).items():
            if neighbor not in visited:
                new_dist = dist + weight
                if neighbor not in distances or new_dist < distances[neighbor]:
                    distances[neighbor] = new_dist
                    parent[neighbor] = node
                    heapq.heappush(pq, (new_dist, neighbor))

    paths = {}
    for node in distances:
        if node == start_node:
            paths[node] = [start_node]
        else:
            paths[node] = _reconstruct_path(parent, start_node, node)

    unreachable = [n for n in graph.nodes if n not in distances]
    return {"distances": distances, "paths": paths, "unreachable": sorted(unreachable)}


def has_path(graph_id: str, start_node: str, end_node: str) -> Dict[str, Any]:
    """Check if a path exists between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"exists": False}

    if start_node not in graph.nodes or end_node not in graph.nodes:
        return {"exists": False}

    if start_node == end_node:
        return {"exists": True}

    visited = {start_node}
    queue = deque([start_node])

    while queue:
        node = queue.popleft()
        for neighbor in graph.adjacency.get(node, {}).keys():
            if neighbor == end_node:
                return {"exists": True}
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return {"exists": False}
