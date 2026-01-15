"""Type definitions for graph library."""
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Any
import uuid
import json
import os

STORAGE_FILE = "/tmp/graphlib_storage.json"


@dataclass
class Graph:
    """Represents a graph with nodes and edges."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    directed: bool = False
    weighted: bool = False
    nodes: Set[str] = field(default_factory=set)
    adjacency: Dict[str, Dict[str, float]] = field(default_factory=dict)

    def get_node_count(self) -> int:
        return len(self.nodes)

    def get_edge_count(self) -> int:
        count = 0
        for from_node, neighbors in self.adjacency.items():
            count += len(neighbors)
        if not self.directed:
            count //= 2
        return count

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "directed": self.directed,
            "weighted": self.weighted,
            "nodes": list(self.nodes),
            "adjacency": self.adjacency
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Graph":
        g = cls(
            id=data["id"],
            directed=data["directed"],
            weighted=data["weighted"]
        )
        g.nodes = set(data["nodes"])
        g.adjacency = data["adjacency"]
        return g


def _load_storage() -> Dict[str, Graph]:
    """Load graphs from storage file."""
    if not os.path.exists(STORAGE_FILE):
        return {}
    try:
        with open(STORAGE_FILE, 'r') as f:
            data = json.load(f)
            return {gid: Graph.from_dict(gdata) for gid, gdata in data.items()}
    except (json.JSONDecodeError, KeyError):
        return {}


def _save_storage(graphs: Dict[str, Graph]) -> None:
    """Save graphs to storage file."""
    data = {gid: g.to_dict() for gid, g in graphs.items()}
    with open(STORAGE_FILE, 'w') as f:
        json.dump(data, f)


def get_graph(graph_id: str) -> Optional[Graph]:
    """Get a graph by ID."""
    graphs = _load_storage()
    return graphs.get(graph_id)


def store_graph(graph: Graph) -> None:
    """Store a graph."""
    graphs = _load_storage()
    graphs[graph.id] = graph
    _save_storage(graphs)


def remove_graph(graph_id: str) -> bool:
    """Remove a graph from storage."""
    graphs = _load_storage()
    if graph_id in graphs:
        del graphs[graph_id]
        _save_storage(graphs)
        return True
    return False
