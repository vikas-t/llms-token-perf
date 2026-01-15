"""Pathfinding algorithms: shortest path, all shortest paths, has path."""
from typing import Dict, List, Any, Optional, Tuple
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

    # Same node
    if start_node == end_node:
        return {"exists": True, "path": [start_node], "distance": 0}

    # Use Dijkstra for weighted graphs, BFS for unweighted
    if graph.weighted:
        return _dijkstra_path(graph, start_node, end_node)
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
            # Reconstruct path
            path = []
            current = end_node
            while current is not None:
                path.append(current)
                current = parent.get(current)
            path.reverse()
            return {
                "exists": True,
                "path": path,
                "distance": len(path) - 1
            }

        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                queue.append(neighbor)

    return {"exists": False, "path": [], "distance": -1}


def _dijkstra_path(graph, start_node: str, end_node: str) -> Dict[str, Any]:
    """Dijkstra's algorithm for weighted graphs."""
    dist = {start_node: 0}
    parent = {}
    visited = set()
    heap = [(0, start_node)]

    while heap:
        d, node = heapq.heappop(heap)

        if node in visited:
            continue
        visited.add(node)

        if node == end_node:
            # Reconstruct path
            path = []
            current = end_node
            while current is not None:
                path.append(current)
                current = parent.get(current)
            path.reverse()
            return {
                "exists": True,
                "path": path,
                "distance": dist[end_node]
            }

        for neighbor, weight in graph.adj.get(node, {}).items():
            if neighbor not in visited:
                new_dist = d + weight
                if neighbor not in dist or new_dist < dist[neighbor]:
                    dist[neighbor] = new_dist
                    parent[neighbor] = node
                    heapq.heappush(heap, (new_dist, neighbor))

    return {"exists": False, "path": [], "distance": -1}


def all_shortest_paths(graph_id: str, start_node: str) -> Dict[str, Any]:
    """Find shortest paths from start node to all reachable nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"distances": {}, "paths": {}, "unreachable": []}

    if start_node not in graph.nodes:
        return {"distances": {}, "paths": {}, "unreachable": sorted(graph.nodes)}

    if graph.weighted:
        return _dijkstra_all(graph, start_node)
    else:
        return _bfs_all(graph, start_node)


def _bfs_all(graph, start_node: str) -> Dict[str, Any]:
    """BFS-based all shortest paths for unweighted graphs."""
    distances = {start_node: 0}
    paths = {start_node: [start_node]}
    parent = {}
    visited = {start_node}
    queue = deque([start_node])

    while queue:
        node = queue.popleft()

        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = node
                distances[neighbor] = distances[node] + 1
                # Build path
                path = []
                current = neighbor
                while current is not None:
                    path.append(current)
                    current = parent.get(current)
                path.reverse()
                paths[neighbor] = path
                queue.append(neighbor)

    # Find unreachable nodes
    unreachable = sorted(node for node in graph.nodes if node not in distances)

    return {
        "distances": distances,
        "paths": paths,
        "unreachable": unreachable
    }


def _dijkstra_all(graph, start_node: str) -> Dict[str, Any]:
    """Dijkstra's algorithm for all shortest paths in weighted graphs."""
    dist = {start_node: 0}
    parent = {}
    visited = set()
    heap = [(0, start_node)]

    while heap:
        d, node = heapq.heappop(heap)

        if node in visited:
            continue
        visited.add(node)

        for neighbor, weight in graph.adj.get(node, {}).items():
            if neighbor not in visited:
                new_dist = d + weight
                if neighbor not in dist or new_dist < dist[neighbor]:
                    dist[neighbor] = new_dist
                    parent[neighbor] = node
                    heapq.heappush(heap, (new_dist, neighbor))

    # Build paths
    paths = {}
    for node in dist:
        path = []
        current = node
        while current is not None:
            path.append(current)
            current = parent.get(current)
        path.reverse()
        paths[node] = path

    # Find unreachable nodes
    unreachable = sorted(node for node in graph.nodes if node not in dist)

    return {
        "distances": dist,
        "paths": paths,
        "unreachable": unreachable
    }


def has_path(graph_id: str, start_node: str, end_node: str) -> Dict[str, Any]:
    """Check if a path exists between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"exists": False}

    if start_node not in graph.nodes or end_node not in graph.nodes:
        return {"exists": False}

    # Same node
    if start_node == end_node:
        return {"exists": True}

    # Simple BFS to check connectivity
    visited = {start_node}
    queue = deque([start_node])

    while queue:
        node = queue.popleft()
        if node == end_node:
            return {"exists": True}

        for neighbor in graph.adj.get(node, {}).keys():
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return {"exists": False}
