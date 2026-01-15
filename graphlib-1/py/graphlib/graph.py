"""Graph class and basic operations."""
from typing import Dict, List, Any, Optional
from .types import Graph, get_graph, store_graph, update_graph


def create_graph(options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a new graph."""
    opts = options or {}
    graph = Graph(
        directed=opts.get("directed", False),
        weighted=opts.get("weighted", False)
    )
    store_graph(graph)
    return {
        "id": graph.id,
        "directed": graph.directed,
        "weighted": graph.weighted,
        "node_count": 0,
        "edge_count": 0
    }


def add_node(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Add a node to the graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}
    if node_id in graph.nodes:
        return {"success": False, "error": "node_already_exists"}
    graph.nodes.add(node_id)
    graph.adj[node_id] = {}
    graph.in_adj[node_id] = {}
    update_graph(graph)
    return {"success": True, "node_id": node_id}


def _ensure_node(graph: Graph, node_id: str) -> None:
    """Ensure a node exists in the graph."""
    if node_id not in graph.nodes:
        graph.nodes.add(node_id)
        graph.adj[node_id] = {}
        graph.in_adj[node_id] = {}


def add_edge(graph_id: str, from_node: str, to_node: str, weight: Optional[float] = None) -> Dict[str, Any]:
    """Add an edge between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    w = weight if weight is not None else 1.0

    # Ensure nodes exist
    _ensure_node(graph, from_node)
    _ensure_node(graph, to_node)

    # Check if edge already exists
    if to_node in graph.adj[from_node]:
        return {"success": False, "error": "edge_already_exists"}

    # Add edge
    graph.adj[from_node][to_node] = w
    graph.in_adj[to_node][from_node] = w

    # For undirected graphs, add reverse edge too
    if not graph.directed:
        graph.adj[to_node][from_node] = w
        graph.in_adj[from_node][to_node] = w

    update_graph(graph)
    return {"success": True, "from": from_node, "to": to_node, "weight": w}


def remove_node(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Remove a node and all its incident edges."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}
    if node_id not in graph.nodes:
        return {"success": False, "error": "node_not_found"}

    removed_edges = 0

    # Count and remove outgoing edges
    removed_edges += len(graph.adj[node_id])

    # Remove from neighbors' in_adj
    for neighbor in graph.adj[node_id]:
        if node_id in graph.in_adj.get(neighbor, {}):
            del graph.in_adj[neighbor][node_id]

    # Count and remove incoming edges (for directed graphs)
    if graph.directed:
        for source in graph.in_adj.get(node_id, {}):
            if node_id in graph.adj.get(source, {}):
                del graph.adj[source][node_id]
                removed_edges += 1
    else:
        # For undirected, remove reverse edges from neighbors
        for neighbor in list(graph.adj[node_id].keys()):
            if neighbor != node_id and node_id in graph.adj.get(neighbor, {}):
                del graph.adj[neighbor][node_id]
            if neighbor != node_id and node_id in graph.in_adj.get(neighbor, {}):
                del graph.in_adj[neighbor][node_id]

    # Remove the node itself
    del graph.adj[node_id]
    del graph.in_adj[node_id]
    graph.nodes.remove(node_id)

    update_graph(graph)
    return {"success": True, "removed_edges": removed_edges}


def remove_edge(graph_id: str, from_node: str, to_node: str) -> Dict[str, Any]:
    """Remove an edge between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    if from_node not in graph.adj or to_node not in graph.adj[from_node]:
        return {"success": False, "error": "edge_not_found"}

    # Remove edge
    del graph.adj[from_node][to_node]
    if from_node in graph.in_adj.get(to_node, {}):
        del graph.in_adj[to_node][from_node]

    # For undirected, remove reverse edge
    if not graph.directed:
        if from_node in graph.adj.get(to_node, {}):
            del graph.adj[to_node][from_node]
        if to_node in graph.in_adj.get(from_node, {}):
            del graph.in_adj[from_node][to_node]

    update_graph(graph)
    return {"success": True}


def get_nodes(graph_id: str) -> Dict[str, Any]:
    """Get all nodes in the graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"nodes": [], "count": 0}
    nodes = sorted(list(graph.nodes))
    return {"nodes": nodes, "count": len(nodes)}


def get_edges(graph_id: str) -> Dict[str, Any]:
    """Get all edges in the graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"edges": [], "count": 0}

    edges = []
    seen = set()

    for from_node in sorted(graph.adj.keys()):
        for to_node in sorted(graph.adj[from_node].keys()):
            if graph.directed:
                edges.append({
                    "from": from_node,
                    "to": to_node,
                    "weight": graph.adj[from_node][to_node]
                })
            else:
                # For undirected, only add each edge once
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key not in seen:
                    seen.add(edge_key)
                    edges.append({
                        "from": from_node,
                        "to": to_node,
                        "weight": graph.adj[from_node][to_node]
                    })

    return {"edges": edges, "count": len(edges)}


def get_neighbors(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get all neighbors of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"neighbors": [], "count": 0}
    if node_id not in graph.nodes:
        return {"neighbors": [], "count": 0}

    neighbors = sorted(list(graph.adj[node_id].keys()))
    return {"neighbors": neighbors, "count": len(neighbors)}


def has_node(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Check if a node exists."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"exists": False}
    return {"exists": node_id in graph.nodes}


def has_edge(graph_id: str, from_node: str, to_node: str) -> Dict[str, Any]:
    """Check if an edge exists."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"exists": False}

    exists = from_node in graph.adj and to_node in graph.adj[from_node]
    if exists:
        return {"exists": True, "weight": graph.adj[from_node][to_node]}
    return {"exists": False}


def get_degree(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get the degree of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"degree": 0, "in_degree": 0, "out_degree": 0}
    if node_id not in graph.nodes:
        return {"degree": 0, "in_degree": 0, "out_degree": 0}

    out_degree = len(graph.adj[node_id])
    in_degree = len(graph.in_adj[node_id])

    if graph.directed:
        degree = in_degree + out_degree
    else:
        # For undirected, in_degree == out_degree
        degree = out_degree
        in_degree = out_degree

    return {"degree": degree, "in_degree": in_degree, "out_degree": out_degree}


def get_graph_info(graph_id: str) -> Dict[str, Any]:
    """Get information about a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    # Import here to avoid circular imports
    from .components import is_connected, has_cycle

    edge_count = 0
    for node in graph.adj:
        edge_count += len(graph.adj[node])
    if not graph.directed:
        edge_count //= 2

    conn_result = is_connected(graph_id)
    cycle_result = has_cycle(graph_id)

    return {
        "id": graph.id,
        "directed": graph.directed,
        "weighted": graph.weighted,
        "node_count": len(graph.nodes),
        "edge_count": edge_count,
        "is_connected": conn_result.get("is_connected", False),
        "has_cycle": cycle_result.get("has_cycle", False)
    }


def clear_graph(graph_id: str) -> Dict[str, Any]:
    """Remove all nodes and edges from a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    graph.nodes.clear()
    graph.adj.clear()
    graph.in_adj.clear()

    update_graph(graph)
    return {"success": True}


def clone_graph(graph_id: str) -> Dict[str, Any]:
    """Create a copy of a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    new_graph = Graph(
        directed=graph.directed,
        weighted=graph.weighted
    )
    new_graph.nodes = set(graph.nodes)
    new_graph.adj = {k: dict(v) for k, v in graph.adj.items()}
    new_graph.in_adj = {k: dict(v) for k, v in graph.in_adj.items()}

    store_graph(new_graph)

    edge_count = 0
    for node in new_graph.adj:
        edge_count += len(new_graph.adj[node])
    if not new_graph.directed:
        edge_count //= 2

    return {
        "id": new_graph.id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": len(new_graph.nodes),
        "edge_count": edge_count
    }


def subgraph(graph_id: str, nodes: List[str]) -> Dict[str, Any]:
    """Create a subgraph containing only specified nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    node_set = set(nodes) & graph.nodes  # Only include nodes that exist

    new_graph = Graph(
        directed=graph.directed,
        weighted=graph.weighted
    )
    new_graph.nodes = node_set

    for node in node_set:
        new_graph.adj[node] = {}
        new_graph.in_adj[node] = {}

    edge_count = 0
    for from_node in node_set:
        for to_node, weight in graph.adj.get(from_node, {}).items():
            if to_node in node_set:
                new_graph.adj[from_node][to_node] = weight
                new_graph.in_adj[to_node][from_node] = weight
                if graph.directed:
                    edge_count += 1

    if not graph.directed:
        edge_count = sum(len(new_graph.adj[n]) for n in new_graph.adj) // 2

    store_graph(new_graph)

    return {
        "id": new_graph.id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": len(new_graph.nodes),
        "edge_count": edge_count
    }
