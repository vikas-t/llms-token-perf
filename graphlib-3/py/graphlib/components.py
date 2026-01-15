"""Connected components, cycle detection, and topological sort."""
from typing import Dict, List, Any, Set
from collections import deque
from .types import get_graph


def has_cycle(graph_id: str) -> Dict[str, Any]:
    """Check if the graph contains any cycle."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"has_cycle": False, "cycle": []}

    if not graph.nodes:
        return {"has_cycle": False, "cycle": []}

    if graph.directed:
        return _has_cycle_directed(graph)
    else:
        return _has_cycle_undirected(graph)


def _has_cycle_directed(graph) -> Dict[str, Any]:
    """Detect cycle in directed graph using DFS coloring."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph.nodes}
    parent = {}

    def dfs(node: str) -> List[str]:
        color[node] = GRAY
        for neighbor in sorted(graph.adjacency.get(node, {}).keys()):
            if color[neighbor] == GRAY:
                # Found cycle, reconstruct it
                cycle = [neighbor]
                current = node
                while current != neighbor:
                    cycle.append(current)
                    current = parent.get(current)
                    if current is None:
                        break
                cycle.append(neighbor)
                cycle.reverse()
                return cycle
            elif color[neighbor] == WHITE:
                parent[neighbor] = node
                result = dfs(neighbor)
                if result:
                    return result
        color[node] = BLACK
        return []

    for node in sorted(graph.nodes):
        if color[node] == WHITE:
            cycle = dfs(node)
            if cycle:
                return {"has_cycle": True, "cycle": cycle}

    return {"has_cycle": False, "cycle": []}


def _has_cycle_undirected(graph) -> Dict[str, Any]:
    """Detect cycle in undirected graph using DFS."""
    visited = set()
    parent = {}

    def dfs(node: str, par: str) -> List[str]:
        visited.add(node)
        for neighbor in sorted(graph.adjacency.get(node, {}).keys()):
            if neighbor not in visited:
                parent[neighbor] = node
                result = dfs(neighbor, node)
                if result:
                    return result
            elif neighbor != par:
                # Found cycle
                cycle = [neighbor]
                current = node
                while current != neighbor:
                    cycle.append(current)
                    current = parent.get(current)
                    if current is None:
                        break
                cycle.append(neighbor)
                return cycle
        return []

    for node in sorted(graph.nodes):
        if node not in visited:
            cycle = dfs(node, None)
            if cycle:
                return {"has_cycle": True, "cycle": cycle}

    return {"has_cycle": False, "cycle": []}


def is_dag(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is a Directed Acyclic Graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_dag": False}

    if not graph.directed:
        return {"is_dag": False}

    cycle_result = has_cycle(graph_id)
    return {"is_dag": not cycle_result["has_cycle"]}


def topological_sort(graph_id: str) -> Dict[str, Any]:
    """Compute topological ordering of a DAG."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    if not graph.directed:
        return {"success": False, "error": "not_a_dag"}

    # Check for cycle
    cycle_result = has_cycle(graph_id)
    if cycle_result["has_cycle"]:
        return {"success": False, "error": "not_a_dag"}

    # Kahn's algorithm
    in_degree = {node: 0 for node in graph.nodes}
    for node in graph.nodes:
        for neighbor in graph.adjacency.get(node, {}):
            in_degree[neighbor] += 1

    queue = deque(sorted([n for n in graph.nodes if in_degree[n] == 0]))
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)
        neighbors = sorted(graph.adjacency.get(node, {}).keys())
        for neighbor in neighbors:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return {"success": True, "order": order}


def connected_components(graph_id: str) -> Dict[str, Any]:
    """Find all connected components."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"count": 0, "components": []}

    if not graph.nodes:
        return {"count": 0, "components": []}

    # For directed graphs, compute weakly connected components (ignore direction)
    visited = set()
    components = []

    def bfs(start: str) -> List[str]:
        component = []
        queue = deque([start])
        visited.add(start)
        while queue:
            node = queue.popleft()
            component.append(node)
            # Get all neighbors (treating graph as undirected)
            neighbors = set(graph.adjacency.get(node, {}).keys())
            if graph.directed:
                for other in graph.nodes:
                    if node in graph.adjacency.get(other, {}):
                        neighbors.add(other)
            for neighbor in sorted(neighbors):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return sorted(component)

    for node in sorted(graph.nodes):
        if node not in visited:
            comp = bfs(node)
            components.append(comp)

    return {"count": len(components), "components": components}


def strongly_connected_components(graph_id: str) -> Dict[str, Any]:
    """Find strongly connected components (for directed graphs)."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"count": 0, "components": []}

    if not graph.nodes:
        return {"count": 0, "components": []}

    if not graph.directed:
        return connected_components(graph_id)

    # Tarjan's algorithm
    index_counter = [0]
    index = {}
    lowlink = {}
    on_stack = {}
    stack = []
    components = []

    def strongconnect(node: str):
        index[node] = index_counter[0]
        lowlink[node] = index_counter[0]
        index_counter[0] += 1
        on_stack[node] = True
        stack.append(node)

        for neighbor in sorted(graph.adjacency.get(node, {}).keys()):
            if neighbor not in index:
                strongconnect(neighbor)
                lowlink[node] = min(lowlink[node], lowlink[neighbor])
            elif on_stack.get(neighbor, False):
                lowlink[node] = min(lowlink[node], index[neighbor])

        if lowlink[node] == index[node]:
            component = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                component.append(w)
                if w == node:
                    break
            components.append(sorted(component))

    for node in sorted(graph.nodes):
        if node not in index:
            strongconnect(node)

    return {"count": len(components), "components": components}


def is_connected(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is connected."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_connected": False}

    if not graph.nodes:
        return {"is_connected": True}

    if len(graph.nodes) == 1:
        return {"is_connected": True}

    result = connected_components(graph_id)
    return {"is_connected": result["count"] == 1}
