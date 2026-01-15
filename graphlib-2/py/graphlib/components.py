"""Connected components, cycle detection, and topological sort."""
from typing import Dict, List, Any, Set, Optional
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
    """Detect cycle in directed graph using DFS."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph.nodes}
    parent = {}
    cycle_start = [None]
    cycle_end = [None]

    def dfs(node: str) -> bool:
        color[node] = GRAY
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if color[neighbor] == GRAY:
                # Back edge found - cycle detected
                cycle_start[0] = neighbor
                cycle_end[0] = node
                return True
            if color[neighbor] == WHITE:
                parent[neighbor] = node
                if dfs(neighbor):
                    return True
        color[node] = BLACK
        return False

    for node in sorted(graph.nodes):
        if color[node] == WHITE:
            if dfs(node):
                # Reconstruct cycle
                cycle = [cycle_start[0]]
                current = cycle_end[0]
                while current != cycle_start[0]:
                    cycle.append(current)
                    current = parent.get(current)
                    if current is None:
                        break
                cycle.append(cycle_start[0])
                cycle.reverse()
                return {"has_cycle": True, "cycle": cycle}

    return {"has_cycle": False, "cycle": []}


def _has_cycle_undirected(graph) -> Dict[str, Any]:
    """Detect cycle in undirected graph using DFS."""
    visited = set()
    parent = {}

    def dfs(node: str, par: Optional[str]) -> Optional[List[str]]:
        visited.add(node)
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in visited:
                parent[neighbor] = node
                result = dfs(neighbor, node)
                if result:
                    return result
            elif neighbor != par:
                # Back edge found - cycle detected
                cycle = [neighbor]
                current = node
                while current != neighbor:
                    cycle.append(current)
                    current = parent.get(current)
                    if current is None:
                        break
                cycle.append(neighbor)
                return cycle
        return None

    for node in sorted(graph.nodes):
        if node not in visited:
            result = dfs(node, None)
            if result:
                return {"has_cycle": True, "cycle": result}

    return {"has_cycle": False, "cycle": []}


def is_dag(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is a Directed Acyclic Graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_dag": False}

    # Must be directed
    if not graph.directed:
        return {"is_dag": False}

    # Check for cycles
    cycle_result = has_cycle(graph_id)
    return {"is_dag": not cycle_result["has_cycle"]}


def topological_sort(graph_id: str) -> Dict[str, Any]:
    """Compute topological ordering of a DAG."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    # Must be directed
    if not graph.directed:
        return {"success": False, "error": "not_a_dag"}

    # Check for cycles using Kahn's algorithm
    in_degree = {node: 0 for node in graph.nodes}
    for node in graph.nodes:
        for neighbor in graph.adj.get(node, {}):
            in_degree[neighbor] += 1

    # Start with nodes that have no incoming edges
    queue = deque(sorted(node for node in graph.nodes if in_degree[node] == 0))
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)

        # Reduce in-degree for neighbors
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # If not all nodes are in the order, there's a cycle
    if len(order) != len(graph.nodes):
        return {"success": False, "error": "not_a_dag"}

    return {"success": True, "order": order}


def connected_components(graph_id: str) -> Dict[str, Any]:
    """Find all connected components (for undirected graphs, or weak connectivity for directed)."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"count": 0, "components": []}

    if not graph.nodes:
        return {"count": 0, "components": []}

    # Build undirected adjacency for weak connectivity
    undirected_adj = {node: set() for node in graph.nodes}
    for node in graph.nodes:
        for neighbor in graph.adj.get(node, {}):
            undirected_adj[node].add(neighbor)
            undirected_adj[neighbor].add(node)

    visited = set()
    components = []

    for start_node in sorted(graph.nodes):
        if start_node in visited:
            continue

        # BFS to find component
        component = []
        queue = deque([start_node])
        visited.add(start_node)

        while queue:
            node = queue.popleft()
            component.append(node)

            for neighbor in sorted(undirected_adj[node]):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        components.append(sorted(component))

    return {"count": len(components), "components": components}


def strongly_connected_components(graph_id: str) -> Dict[str, Any]:
    """Find strongly connected components (Kosaraju's algorithm)."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"count": 0, "components": []}

    if not graph.nodes:
        return {"count": 0, "components": []}

    # For undirected graphs, SCC equals CC
    if not graph.directed:
        return connected_components(graph_id)

    # Kosaraju's algorithm
    # Step 1: Fill order by finish time (DFS)
    visited = set()
    order = []

    def dfs1(node: str) -> None:
        visited.add(node)
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in visited:
                dfs1(neighbor)
        order.append(node)

    for node in sorted(graph.nodes):
        if node not in visited:
            dfs1(node)

    # Step 2: Build reverse graph (use in_adj)
    # Step 3: DFS on reverse graph in order of decreasing finish time
    visited.clear()
    components = []

    def dfs2(node: str, component: List[str]) -> None:
        visited.add(node)
        component.append(node)
        for neighbor in sorted(graph.in_adj.get(node, {}).keys()):
            if neighbor not in visited:
                dfs2(neighbor, component)

    for node in reversed(order):
        if node not in visited:
            component = []
            dfs2(node, component)
            components.append(sorted(component))

    return {"count": len(components), "components": components}


def is_connected(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is connected (weak connectivity for directed)."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_connected": False}

    # Empty graph is considered connected
    if not graph.nodes:
        return {"is_connected": True}

    # Single node is connected
    if len(graph.nodes) == 1:
        return {"is_connected": True}

    result = connected_components(graph_id)
    return {"is_connected": result["count"] == 1}
