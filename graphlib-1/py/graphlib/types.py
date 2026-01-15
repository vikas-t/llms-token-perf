"""Type definitions for the graph library."""
from dataclasses import dataclass, field
from typing import Dict, Set, Optional, Any
import uuid
import json
import os

STORAGE_FILE = "/tmp/graphlib_state.json"


@dataclass
class Edge:
    """Represents an edge in the graph."""
    from_node: str
    to_node: str
    weight: float = 1.0


@dataclass
class Graph:
    """Represents a graph with adjacency list representation."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    directed: bool = False
    weighted: bool = False
    nodes: Set[str] = field(default_factory=set)
    # Adjacency list: node -> {neighbor -> weight}
    adj: Dict[str, Dict[str, float]] = field(default_factory=dict)
    # For directed graphs, track incoming edges for in-degree calculation
    in_adj: Dict[str, Dict[str, float]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert graph to dictionary for serialization."""
        return {
            "id": self.id,
            "directed": self.directed,
            "weighted": self.weighted,
            "nodes": list(self.nodes),
            "adj": self.adj,
            "in_adj": self.in_adj
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Graph":
        """Create graph from dictionary."""
        graph = cls(
            id=data["id"],
            directed=data["directed"],
            weighted=data["weighted"]
        )
        graph.nodes = set(data["nodes"])
        graph.adj = data["adj"]
        graph.in_adj = data["in_adj"]
        return graph


def _load_graphs() -> Dict[str, Graph]:
    """Load graphs from storage file."""
    if not os.path.exists(STORAGE_FILE):
        return {}
    try:
        with open(STORAGE_FILE, 'r') as f:
            data = json.load(f)
        return {k: Graph.from_dict(v) for k, v in data.items()}
    except (json.JSONDecodeError, KeyError):
        return {}


def _save_graphs(graphs: Dict[str, Graph]) -> None:
    """Save graphs to storage file."""
    data = {k: v.to_dict() for k, v in graphs.items()}
    with open(STORAGE_FILE, 'w') as f:
        json.dump(data, f)


def get_graph(graph_id: str) -> Optional[Graph]:
    """Get a graph by ID."""
    graphs = _load_graphs()
    return graphs.get(graph_id)


def store_graph(graph: Graph) -> None:
    """Store a graph."""
    graphs = _load_graphs()
    graphs[graph.id] = graph
    _save_graphs(graphs)


def remove_graph(graph_id: str) -> bool:
    """Remove a graph from storage."""
    graphs = _load_graphs()
    if graph_id in graphs:
        del graphs[graph_id]
        _save_graphs(graphs)
        return True
    return False


def update_graph(graph: Graph) -> None:
    """Update a graph in storage."""
    store_graph(graph)
