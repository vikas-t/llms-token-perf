"""Graph creation and modification operations."""
from typing import Dict, List, Any, Optional
from .types import Graph, get_graph, store_graph


def create_graph(options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a new graph."""
    options = options or {}
    graph = Graph(
        directed=options.get("directed", False),
        weighted=options.get("weighted", False)
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
    graph.adjacency[node_id] = {}
    store_graph(graph)
    return {"success": True, "node_id": node_id}


def add_edge(graph_id: str, from_node: str, to_node: str, weight: Optional[float] = None) -> Dict[str, Any]:
    """Add an edge between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    # Default weight
    if weight is None:
        weight = 1.0

    # Auto-create nodes
    for node in [from_node, to_node]:
        if node not in graph.nodes:
            graph.nodes.add(node)
            graph.adjacency[node] = {}

    # Check for duplicate edge
    if to_node in graph.adjacency.get(from_node, {}):
        return {"success": False, "error": "edge_already_exists"}

    # Add edge
    graph.adjacency[from_node][to_node] = weight
    if not graph.directed:
        graph.adjacency[to_node][from_node] = weight

    store_graph(graph)
    return {"success": True, "from": from_node, "to": to_node, "weight": weight}


def remove_node(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Remove a node and all incident edges."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}
    if node_id not in graph.nodes:
        return {"success": False, "error": "node_not_found"}

    removed_edges = 0
    # Count and remove outgoing edges
    if node_id in graph.adjacency:
        removed_edges += len(graph.adjacency[node_id])
        del graph.adjacency[node_id]

    # Remove incoming edges
    for other_node in list(graph.adjacency.keys()):
        if node_id in graph.adjacency[other_node]:
            del graph.adjacency[other_node][node_id]
            if graph.directed:
                removed_edges += 1

    graph.nodes.remove(node_id)
    store_graph(graph)
    return {"success": True, "removed_edges": removed_edges}


def remove_edge(graph_id: str, from_node: str, to_node: str) -> Dict[str, Any]:
    """Remove an edge between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    if from_node not in graph.adjacency or to_node not in graph.adjacency[from_node]:
        return {"success": False, "error": "edge_not_found"}

    del graph.adjacency[from_node][to_node]
    if not graph.directed:
        if to_node in graph.adjacency and from_node in graph.adjacency[to_node]:
            del graph.adjacency[to_node][from_node]

    store_graph(graph)
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
    for from_node in sorted(graph.adjacency.keys()):
        for to_node in sorted(graph.adjacency[from_node].keys()):
            if graph.directed:
                edges.append({
                    "from": from_node,
                    "to": to_node,
                    "weight": graph.adjacency[from_node][to_node]
                })
            else:
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key not in seen:
                    seen.add(edge_key)
                    edges.append({
                        "from": from_node,
                        "to": to_node,
                        "weight": graph.adjacency[from_node][to_node]
                    })

    return {"edges": edges, "count": len(edges)}


def get_neighbors(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get all neighbors of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"neighbors": [], "count": 0}

    neighbors = sorted(list(graph.adjacency.get(node_id, {}).keys()))
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

    exists = from_node in graph.adjacency and to_node in graph.adjacency[from_node]
    if exists:
        return {"exists": True, "weight": graph.adjacency[from_node][to_node]}
    return {"exists": False}


def get_degree(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get the degree of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"degree": 0, "in_degree": 0, "out_degree": 0}

    out_degree = len(graph.adjacency.get(node_id, {}))
    in_degree = 0
    for other_node in graph.adjacency:
        if node_id in graph.adjacency[other_node]:
            in_degree += 1

    if graph.directed:
        degree = in_degree + out_degree
    else:
        degree = out_degree
        in_degree = out_degree

    return {"degree": degree, "in_degree": in_degree, "out_degree": out_degree}


def get_graph_info(graph_id: str) -> Dict[str, Any]:
    """Get information about a graph."""
    from .components import is_connected as check_connected, has_cycle as check_cycle

    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    conn_result = check_connected(graph_id)
    cycle_result = check_cycle(graph_id)

    return {
        "id": graph.id,
        "directed": graph.directed,
        "weighted": graph.weighted,
        "node_count": graph.get_node_count(),
        "edge_count": graph.get_edge_count(),
        "is_connected": conn_result.get("is_connected", False),
        "has_cycle": cycle_result.get("has_cycle", False)
    }


def clear_graph(graph_id: str) -> Dict[str, Any]:
    """Remove all nodes and edges from a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    graph.nodes.clear()
    graph.adjacency.clear()
    store_graph(graph)
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
    new_graph.adjacency = {
        node: dict(neighbors)
        for node, neighbors in graph.adjacency.items()
    }
    store_graph(new_graph)

    return {
        "id": new_graph.id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": new_graph.get_node_count(),
        "edge_count": new_graph.get_edge_count()
    }


def subgraph(graph_id: str, nodes: List[str]) -> Dict[str, Any]:
    """Create a subgraph containing only specified nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    node_set = set(nodes)
    new_graph = Graph(
        directed=graph.directed,
        weighted=graph.weighted
    )

    for node in nodes:
        if node in graph.nodes:
            new_graph.nodes.add(node)
            new_graph.adjacency[node] = {}

    for from_node in new_graph.nodes:
        if from_node in graph.adjacency:
            for to_node, weight in graph.adjacency[from_node].items():
                if to_node in node_set:
                    new_graph.adjacency[from_node][to_node] = weight

    store_graph(new_graph)

    return {
        "id": new_graph.id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": new_graph.get_node_count(),
        "edge_count": new_graph.get_edge_count()
    }
