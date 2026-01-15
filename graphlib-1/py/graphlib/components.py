"""Connected components, cycle detection, and topological sort."""
from typing import Dict, List, Any, Set, Tuple
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
    """Detect cycle in directed graph using DFS with colors."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph.nodes}
    parent = {}

    def dfs(node: str) -> Tuple[bool, List[str]]:
        color[node] = GRAY
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if color[neighbor] == GRAY:
                # Found a back edge - reconstruct cycle
                cycle = [neighbor, node]
                current = node
                while parent.get(current) and parent[current] != neighbor:
                    current = parent[current]
                    cycle.append(current)
                cycle.append(neighbor)
                cycle.reverse()
                return True, cycle
            if color[neighbor] == WHITE:
                parent[neighbor] = node
                found, cycle = dfs(neighbor)
                if found:
                    return True, cycle
        color[node] = BLACK
        return False, []

    for node in sorted(graph.nodes):
        if color[node] == WHITE:
            found, cycle = dfs(node)
            if found:
                return {"has_cycle": True, "cycle": cycle}

    return {"has_cycle": False, "cycle": []}


def _has_cycle_undirected(graph) -> Dict[str, Any]:
    """Detect cycle in undirected graph using DFS."""
    visited = set()
    parent = {}

    def dfs(node: str, par: str) -> Tuple[bool, List[str]]:
        visited.add(node)
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in visited:
                parent[neighbor] = node
                found, cycle = dfs(neighbor, node)
                if found:
                    return True, cycle
            elif neighbor != par:
                # Found a back edge - reconstruct cycle
                cycle = [neighbor]
                current = node
                while current != neighbor:
                    cycle.append(current)
                    current = parent.get(current, neighbor)
                cycle.append(neighbor)
                return True, cycle
        return False, []

    for node in sorted(graph.nodes):
        if node not in visited:
            found, cycle = dfs(node, "")
            if found:
                return {"has_cycle": True, "cycle": cycle}

    return {"has_cycle": False, "cycle": []}


def is_dag(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is a Directed Acyclic Graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_dag": False}

    # Only directed graphs can be DAGs
    if not graph.directed:
        return {"is_dag": False}

    # Empty directed graph is a DAG
    if not graph.nodes:
        return {"is_dag": True}

    # Check for cycles
    cycle_result = has_cycle(graph_id)
    return {"is_dag": not cycle_result["has_cycle"]}


def topological_sort(graph_id: str) -> Dict[str, Any]:
    """Compute topological ordering of a DAG."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    # Only works for directed graphs
    if not graph.directed:
        return {"success": False, "error": "not_a_dag"}

    # Check for cycles
    if has_cycle(graph_id)["has_cycle"]:
        return {"success": False, "error": "not_a_dag"}

    # Kahn's algorithm
    in_degree = {node: 0 for node in graph.nodes}
    for node in graph.nodes:
        for neighbor in graph.adj.get(node, {}):
            in_degree[neighbor] = in_degree.get(neighbor, 0) + 1

    queue = deque(sorted([n for n in graph.nodes if in_degree[n] == 0]))
    order = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in sorted(graph.adj.get(node, {}).keys()):
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

    visited = set()
    components = []

    def bfs(start: str) -> List[str]:
        component = []
        queue = deque([start])
        visited.add(start)

        while queue:
            node = queue.popleft()
            component.append(node)

            # For undirected or weak connectivity in directed, consider both directions
            neighbors = set(graph.adj.get(node, {}).keys())
            if graph.directed:
                neighbors |= set(graph.in_adj.get(node, {}).keys())

            for neighbor in sorted(neighbors):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return sorted(component)

    for node in sorted(graph.nodes):
        if node not in visited:
            component = bfs(node)
            components.append(component)

    return {"count": len(components), "components": components}


def strongly_connected_components(graph_id: str) -> Dict[str, Any]:
    """Find strongly connected components using Tarjan's algorithm."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"count": 0, "components": []}
    if not graph.nodes:
        return {"count": 0, "components": []}

    # For undirected graphs, SCC is same as CC
    if not graph.directed:
        return connected_components(graph_id)

    # Tarjan's algorithm
    index_counter = [0]
    stack = []
    lowlink = {}
    index = {}
    on_stack = {}
    sccs = []

    def strongconnect(node: str) -> None:
        index[node] = index_counter[0]
        lowlink[node] = index_counter[0]
        index_counter[0] += 1
        stack.append(node)
        on_stack[node] = True

        for neighbor in sorted(graph.adj.get(node, {}).keys()):
            if neighbor not in index:
                strongconnect(neighbor)
                lowlink[node] = min(lowlink[node], lowlink[neighbor])
            elif on_stack.get(neighbor, False):
                lowlink[node] = min(lowlink[node], index[neighbor])

        # If node is a root node, pop the stack and generate an SCC
        if lowlink[node] == index[node]:
            scc = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                scc.append(w)
                if w == node:
                    break
            sccs.append(sorted(scc))

    for node in sorted(graph.nodes):
        if node not in index:
            strongconnect(node)

    return {"count": len(sccs), "components": sccs}


def is_connected(graph_id: str) -> Dict[str, Any]:
    """Check if the graph is connected."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"is_connected": False}

    # Empty graph is considered connected
    if not graph.nodes:
        return {"is_connected": True}

    # Single node is connected
    if len(graph.nodes) == 1:
        return {"is_connected": True}

    # Use connected_components (which checks weak connectivity for directed)
    cc = connected_components(graph_id)
    return {"is_connected": cc["count"] == 1}
