"""Type definitions for the graph library with file-based persistence."""
from typing import Dict, List, Optional, Set, TypedDict, Any
from dataclasses import dataclass, field
import json
import os
import tempfile


class GraphOptions(TypedDict, total=False):
    """Options for creating a graph."""
    directed: bool
    weighted: bool


class Edge(TypedDict):
    """Edge representation."""
    from_node: str  # 'from' in JSON
    to_node: str    # 'to' in JSON
    weight: float


@dataclass
class Graph:
    """Internal graph representation using adjacency lists."""
    id: str
    directed: bool = False
    weighted: bool = False
    nodes: Set[str] = field(default_factory=set)
    adj: Dict[str, Dict[str, float]] = field(default_factory=dict)
    in_adj: Dict[str, Dict[str, float]] = field(default_factory=dict)


# File path for persistence
_STORE_FILE = os.path.join(tempfile.gettempdir(), "graphlib_store.json")


def _load_store() -> Dict[str, Any]:
    """Load store from file."""
    if os.path.exists(_STORE_FILE):
        try:
            with open(_STORE_FILE, 'r') as f:
                data = json.load(f)
                # Ensure required keys exist
                if "graphs" not in data:
                    data["graphs"] = {}
                if "counter" not in data:
                    data["counter"] = 0
                return data
        except (json.JSONDecodeError, IOError):
            pass
    return {"graphs": {}, "counter": 0}


def _save_store(store: Dict[str, Any]) -> None:
    """Save store to file."""
    with open(_STORE_FILE, 'w') as f:
        json.dump(store, f)


def _graph_to_dict(graph: Graph) -> Dict[str, Any]:
    """Convert Graph to dict for JSON serialization."""
    return {
        "id": graph.id,
        "directed": graph.directed,
        "weighted": graph.weighted,
        "nodes": list(graph.nodes),
        "adj": graph.adj,
        "in_adj": graph.in_adj
    }


def _dict_to_graph(d: Dict[str, Any]) -> Graph:
    """Convert dict back to Graph."""
    return Graph(
        id=d["id"],
        directed=d["directed"],
        weighted=d["weighted"],
        nodes=set(d["nodes"]),
        adj=d["adj"],
        in_adj=d["in_adj"]
    )


def get_graph(graph_id: str) -> Optional[Graph]:
    """Get a graph by ID."""
    store = _load_store()
    if graph_id in store["graphs"]:
        return _dict_to_graph(store["graphs"][graph_id])
    return None


def store_graph(graph: Graph) -> None:
    """Store a graph."""
    store = _load_store()
    store["graphs"][graph.id] = _graph_to_dict(graph)
    _save_store(store)


def remove_graph(graph_id: str) -> None:
    """Remove a graph from storage."""
    store = _load_store()
    if graph_id in store["graphs"]:
        del store["graphs"][graph_id]
        _save_store(store)


def new_graph_id() -> str:
    """Generate a new unique graph ID."""
    store = _load_store()
    store["counter"] += 1
    _save_store(store)
    return f"graph-{store['counter']}"
