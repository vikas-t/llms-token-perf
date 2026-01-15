"""Graph creation and modification operations."""
from typing import Dict, List, Any, Optional
from .types import Graph, GraphOptions, get_graph, store_graph, new_graph_id


def create_graph(options: Optional[GraphOptions] = None) -> Dict[str, Any]:
    """Create a new graph."""
    opts = options or {}
    directed = opts.get("directed", False)
    weighted = opts.get("weighted", False)

    graph = Graph(
        id=new_graph_id(),
        directed=directed,
        weighted=weighted,
        nodes=set(),
        adj={},
        in_adj={}
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

    store_graph(graph)
    return {"success": True, "node_id": node_id}


def add_edge(graph_id: str, from_node: str, to_node: str, weight: Optional[float] = None) -> Dict[str, Any]:
    """Add an edge between two nodes."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    # Auto-create nodes if they don't exist
    if from_node not in graph.nodes:
        graph.nodes.add(from_node)
        graph.adj[from_node] = {}
        graph.in_adj[from_node] = {}

    if to_node not in graph.nodes:
        graph.nodes.add(to_node)
        graph.adj[to_node] = {}
        graph.in_adj[to_node] = {}

    # Check if edge exists
    if to_node in graph.adj[from_node]:
        return {"success": False, "error": "edge_already_exists"}

    # For undirected graphs, also check reverse direction
    if not graph.directed and from_node != to_node and from_node in graph.adj[to_node]:
        return {"success": False, "error": "edge_already_exists"}

    edge_weight = weight if weight is not None else 1.0

    # Add edge
    graph.adj[from_node][to_node] = edge_weight
    graph.in_adj[to_node][from_node] = edge_weight

    # For undirected graphs, add reverse edge
    if not graph.directed and from_node != to_node:
        graph.adj[to_node][from_node] = edge_weight
        graph.in_adj[from_node][to_node] = edge_weight

    store_graph(graph)
    return {
        "success": True,
        "from": from_node,
        "to": to_node,
        "weight": edge_weight
    }


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
    for neighbor in list(graph.adj[node_id].keys()):
        if node_id in graph.in_adj.get(neighbor, {}):
            del graph.in_adj[neighbor][node_id]

    # Remove incoming edges and update neighbors' adj
    for neighbor in list(graph.in_adj[node_id].keys()):
        if neighbor != node_id and neighbor in graph.adj and node_id in graph.adj[neighbor]:
            del graph.adj[neighbor][node_id]
            if graph.directed:
                removed_edges += 1

    # Remove the node
    del graph.adj[node_id]
    del graph.in_adj[node_id]
    graph.nodes.remove(node_id)

    store_graph(graph)
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

    # For undirected graphs, remove reverse edge
    if not graph.directed and from_node != to_node:
        if to_node in graph.adj and from_node in graph.adj[to_node]:
            del graph.adj[to_node][from_node]
        if from_node in graph.in_adj and to_node in graph.in_adj[from_node]:
            del graph.in_adj[from_node][to_node]

    store_graph(graph)
    return {"success": True}


def get_nodes(graph_id: str) -> Dict[str, Any]:
    """Get all nodes in the graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"nodes": [], "count": 0}

    nodes = sorted(graph.nodes)
    return {"nodes": nodes, "count": len(nodes)}


def get_edges(graph_id: str) -> Dict[str, Any]:
    """Get all edges in the graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"edges": [], "count": 0}

    edges = []
    seen = set()

    for from_node in sorted(graph.adj.keys()):
        for to_node, weight in sorted(graph.adj[from_node].items()):
            # For undirected graphs, only list each edge once
            if not graph.directed:
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key in seen:
                    continue
                seen.add(edge_key)

            edges.append({
                "from": from_node,
                "to": to_node,
                "weight": weight
            })

    return {"edges": edges, "count": len(edges)}


def get_neighbors(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get all neighbors of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"neighbors": [], "count": 0}

    if node_id not in graph.adj:
        return {"neighbors": [], "count": 0}

    neighbors = sorted(graph.adj[node_id].keys())
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

    if from_node not in graph.adj or to_node not in graph.adj[from_node]:
        return {"exists": False}

    return {
        "exists": True,
        "weight": graph.adj[from_node][to_node]
    }


def get_degree(graph_id: str, node_id: str) -> Dict[str, Any]:
    """Get the degree of a node."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"degree": 0, "in_degree": 0, "out_degree": 0}

    if node_id not in graph.nodes:
        return {"degree": 0, "in_degree": 0, "out_degree": 0}

    out_degree = len(graph.adj.get(node_id, {}))
    in_degree = len(graph.in_adj.get(node_id, {}))

    if graph.directed:
        degree = in_degree + out_degree
    else:
        # For undirected, in_degree equals out_degree
        degree = out_degree
        in_degree = out_degree

    return {
        "degree": degree,
        "in_degree": in_degree,
        "out_degree": out_degree
    }


def get_graph_info(graph_id: str) -> Dict[str, Any]:
    """Get information about a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    # Import here to avoid circular imports
    from .components import is_connected, has_cycle

    node_count = len(graph.nodes)

    # Count edges
    edge_count = 0
    if graph.directed:
        for adj in graph.adj.values():
            edge_count += len(adj)
    else:
        seen = set()
        for from_node, adj in graph.adj.items():
            for to_node in adj:
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key not in seen:
                    seen.add(edge_key)
                    edge_count += 1

    conn = is_connected(graph_id)
    cycle = has_cycle(graph_id)

    return {
        "id": graph.id,
        "directed": graph.directed,
        "weighted": graph.weighted,
        "node_count": node_count,
        "edge_count": edge_count,
        "is_connected": conn.get("is_connected", False),
        "has_cycle": cycle.get("has_cycle", False)
    }


def clear_graph(graph_id: str) -> Dict[str, Any]:
    """Remove all nodes and edges from a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"success": False, "error": "graph_not_found"}

    graph.nodes.clear()
    graph.adj.clear()
    graph.in_adj.clear()

    store_graph(graph)
    return {"success": True}


def clone_graph(graph_id: str) -> Dict[str, Any]:
    """Create a copy of a graph."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    new_id = new_graph_id()
    new_graph = Graph(
        id=new_id,
        directed=graph.directed,
        weighted=graph.weighted,
        nodes=set(graph.nodes),
        adj={k: dict(v) for k, v in graph.adj.items()},
        in_adj={k: dict(v) for k, v in graph.in_adj.items()}
    )
    store_graph(new_graph)

    # Count edges
    edge_count = 0
    if graph.directed:
        for adj in new_graph.adj.values():
            edge_count += len(adj)
    else:
        seen = set()
        for from_node, adj in new_graph.adj.items():
            for to_node in adj:
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key not in seen:
                    seen.add(edge_key)
                    edge_count += 1

    return {
        "id": new_id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": len(new_graph.nodes),
        "edge_count": edge_count
    }


def subgraph(graph_id: str, nodes: List[str]) -> Dict[str, Any]:
    """Create a subgraph containing only specified nodes and edges between them."""
    graph = get_graph(graph_id)
    if graph is None:
        return {"error": "graph_not_found"}

    node_set = set(nodes) & graph.nodes  # Only include nodes that exist

    new_id = new_graph_id()
    new_adj = {}
    new_in_adj = {}

    for node in node_set:
        new_adj[node] = {}
        new_in_adj[node] = {}
        for neighbor, weight in graph.adj.get(node, {}).items():
            if neighbor in node_set:
                new_adj[node][neighbor] = weight
        for neighbor, weight in graph.in_adj.get(node, {}).items():
            if neighbor in node_set:
                new_in_adj[node][neighbor] = weight

    new_graph = Graph(
        id=new_id,
        directed=graph.directed,
        weighted=graph.weighted,
        nodes=node_set,
        adj=new_adj,
        in_adj=new_in_adj
    )
    store_graph(new_graph)

    # Count edges
    edge_count = 0
    if graph.directed:
        for adj in new_adj.values():
            edge_count += len(adj)
    else:
        seen = set()
        for from_node, adj in new_adj.items():
            for to_node in adj:
                edge_key = tuple(sorted([from_node, to_node]))
                if edge_key not in seen:
                    seen.add(edge_key)
                    edge_count += 1

    return {
        "id": new_id,
        "directed": new_graph.directed,
        "weighted": new_graph.weighted,
        "node_count": len(node_set),
        "edge_count": edge_count
    }
