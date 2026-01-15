# Graph Algorithm Library Specification

A graph algorithm library supporting directed/undirected and weighted/unweighted graphs with common traversal and pathfinding algorithms.

## Data Structures

### Graph Representation

Graphs should be represented internally using adjacency lists for efficiency. The library should support:
- **Directed** and **Undirected** graphs
- **Weighted** and **Unweighted** edges
- **Self-loops** (edge from node to itself)
- **Parallel edges** are NOT supported (only one edge between any two nodes)

### Node and Edge Types

- **Nodes**: String identifiers (e.g., "A", "B", "node1")
- **Edge weights**: Floating-point numbers (default weight is 1.0 for unweighted graphs)

## API Functions

### Graph Creation and Modification

#### `create_graph(options)`

Create a new graph.

**Parameters:**
- `options` (object):
  - `directed` (boolean, default: false): Whether edges are directed
  - `weighted` (boolean, default: false): Whether edges have weights

**Returns:**
```json
{
  "id": "unique-graph-id",
  "directed": false,
  "weighted": false,
  "node_count": 0,
  "edge_count": 0
}
```

#### `add_node(graph_id, node_id)`

Add a node to the graph.

**Parameters:**
- `graph_id` (string): Graph identifier
- `node_id` (string): Node identifier

**Returns:**
```json
{
  "success": true,
  "node_id": "A"
}
```

**Errors:**
- Returns `{"success": false, "error": "node_already_exists"}` if node exists
- Returns `{"success": false, "error": "graph_not_found"}` if graph doesn't exist

#### `add_edge(graph_id, from_node, to_node, weight?)`

Add an edge between two nodes.

**Parameters:**
- `graph_id` (string): Graph identifier
- `from_node` (string): Source node
- `to_node` (string): Target node
- `weight` (number, optional): Edge weight (default: 1.0)

**Returns:**
```json
{
  "success": true,
  "from": "A",
  "to": "B",
  "weight": 1.0
}
```

**Behavior:**
- Automatically creates nodes if they don't exist
- For undirected graphs, creates edge in both directions internally
- For weighted graphs, stores the weight

**Errors:**
- Returns `{"success": false, "error": "edge_already_exists"}` if edge exists
- Returns `{"success": false, "error": "graph_not_found"}` if graph doesn't exist

#### `remove_node(graph_id, node_id)`

Remove a node and all its incident edges.

**Parameters:**
- `graph_id` (string): Graph identifier
- `node_id` (string): Node to remove

**Returns:**
```json
{
  "success": true,
  "removed_edges": 3
}
```

**Errors:**
- Returns `{"success": false, "error": "node_not_found"}` if node doesn't exist

#### `remove_edge(graph_id, from_node, to_node)`

Remove an edge between two nodes.

**Parameters:**
- `graph_id` (string): Graph identifier
- `from_node` (string): Source node
- `to_node` (string): Target node

**Returns:**
```json
{
  "success": true
}
```

**Errors:**
- Returns `{"success": false, "error": "edge_not_found"}` if edge doesn't exist

### Graph Queries

#### `get_nodes(graph_id)`

Get all nodes in the graph.

**Returns:**
```json
{
  "nodes": ["A", "B", "C"],
  "count": 3
}
```

#### `get_edges(graph_id)`

Get all edges in the graph.

**Returns:**
```json
{
  "edges": [
    {"from": "A", "to": "B", "weight": 1.0},
    {"from": "B", "to": "C", "weight": 2.5}
  ],
  "count": 2
}
```

#### `get_neighbors(graph_id, node_id)`

Get all neighbors of a node.

**Parameters:**
- `graph_id` (string): Graph identifier
- `node_id` (string): Node identifier

**Returns:**
```json
{
  "neighbors": ["B", "C"],
  "count": 2
}
```

For directed graphs, returns only outgoing neighbors.

#### `has_node(graph_id, node_id)`

Check if a node exists.

**Returns:**
```json
{
  "exists": true
}
```

#### `has_edge(graph_id, from_node, to_node)`

Check if an edge exists.

**Returns:**
```json
{
  "exists": true,
  "weight": 1.0
}
```

#### `get_degree(graph_id, node_id)`

Get the degree of a node.

**Returns:**
```json
{
  "degree": 3,
  "in_degree": 2,
  "out_degree": 1
}
```

For undirected graphs, `in_degree` equals `out_degree` equals `degree`.

### Traversal Algorithms

#### `bfs(graph_id, start_node)`

Breadth-first search traversal.

**Parameters:**
- `graph_id` (string): Graph identifier
- `start_node` (string): Starting node

**Returns:**
```json
{
  "order": ["A", "B", "C", "D"],
  "levels": {"A": 0, "B": 1, "C": 1, "D": 2},
  "parent": {"B": "A", "C": "A", "D": "B"}
}
```

- `order`: Nodes in BFS visit order
- `levels`: Distance (in edges) from start node
- `parent`: Parent node in BFS tree (start node has no parent)

#### `dfs(graph_id, start_node)`

Depth-first search traversal.

**Parameters:**
- `graph_id` (string): Graph identifier
- `start_node` (string): Starting node

**Returns:**
```json
{
  "order": ["A", "B", "D", "C"],
  "discovery": {"A": 0, "B": 1, "D": 2, "C": 3},
  "finish": {"D": 3, "B": 4, "C": 5, "A": 6},
  "parent": {"B": "A", "D": "B", "C": "A"}
}
```

- `order`: Nodes in DFS visit order
- `discovery`: Discovery time for each node
- `finish`: Finish time for each node
- `parent`: Parent node in DFS tree

### Pathfinding

#### `shortest_path(graph_id, start_node, end_node)`

Find shortest path between two nodes.

**Parameters:**
- `graph_id` (string): Graph identifier
- `start_node` (string): Source node
- `end_node` (string): Target node

**Returns:**
```json
{
  "exists": true,
  "path": ["A", "B", "D"],
  "distance": 5.5
}
```

**Algorithm:**
- For unweighted graphs: Use BFS
- For weighted graphs: Use Dijkstra's algorithm

**Errors:**
- Returns `{"exists": false, "path": [], "distance": -1}` if no path exists

#### `all_shortest_paths(graph_id, start_node)`

Find shortest paths from start node to all reachable nodes.

**Returns:**
```json
{
  "distances": {"A": 0, "B": 1, "C": 2, "D": 3},
  "paths": {
    "A": ["A"],
    "B": ["A", "B"],
    "C": ["A", "B", "C"],
    "D": ["A", "C", "D"]
  },
  "unreachable": ["E", "F"]
}
```

#### `has_path(graph_id, start_node, end_node)`

Check if a path exists between two nodes.

**Returns:**
```json
{
  "exists": true
}
```

### Cycle Detection

#### `has_cycle(graph_id)`

Check if the graph contains any cycle.

**Returns:**
```json
{
  "has_cycle": true,
  "cycle": ["A", "B", "C", "A"]
}
```

If no cycle exists:
```json
{
  "has_cycle": false,
  "cycle": []
}
```

#### `is_dag(graph_id)`

Check if the graph is a Directed Acyclic Graph.

**Returns:**
```json
{
  "is_dag": true
}
```

For undirected graphs, always returns `{"is_dag": false}` (DAG is only defined for directed graphs).

### Topological Sort

#### `topological_sort(graph_id)`

Compute topological ordering of a DAG.

**Returns:**
```json
{
  "success": true,
  "order": ["A", "B", "C", "D"]
}
```

**Errors:**
- Returns `{"success": false, "error": "not_a_dag"}` if graph has cycles or is undirected

### Connected Components

#### `connected_components(graph_id)`

Find all connected components (for undirected graphs).

**Returns:**
```json
{
  "count": 2,
  "components": [
    ["A", "B", "C"],
    ["D", "E"]
  ]
}
```

For directed graphs, computes **weakly** connected components (ignoring edge direction).

#### `strongly_connected_components(graph_id)`

Find strongly connected components (for directed graphs).

**Returns:**
```json
{
  "count": 3,
  "components": [
    ["A", "B"],
    ["C"],
    ["D", "E", "F"]
  ]
}
```

For undirected graphs, returns same as `connected_components`.

#### `is_connected(graph_id)`

Check if the graph is connected.

**Returns:**
```json
{
  "is_connected": true
}
```

For directed graphs, checks weak connectivity.

### Graph Properties

#### `get_graph_info(graph_id)`

Get information about a graph.

**Returns:**
```json
{
  "id": "graph-123",
  "directed": true,
  "weighted": true,
  "node_count": 5,
  "edge_count": 7,
  "is_connected": true,
  "has_cycle": false
}
```

### Utility Functions

#### `clear_graph(graph_id)`

Remove all nodes and edges from a graph.

**Returns:**
```json
{
  "success": true
}
```

#### `clone_graph(graph_id)`

Create a copy of a graph.

**Returns:**
```json
{
  "id": "new-graph-id",
  "directed": true,
  "weighted": false,
  "node_count": 5,
  "edge_count": 7
}
```

#### `subgraph(graph_id, nodes)`

Create a subgraph containing only specified nodes and edges between them.

**Parameters:**
- `graph_id` (string): Graph identifier
- `nodes` (array): List of node IDs to include

**Returns:**
```json
{
  "id": "subgraph-id",
  "directed": true,
  "weighted": false,
  "node_count": 3,
  "edge_count": 2
}
```

## Edge Cases

1. **Empty graph**: Operations on empty graphs should return appropriate empty results
2. **Single node**: A single node with no edges is valid
3. **Self-loops**: Edges from a node to itself are allowed
4. **Disconnected graphs**: Should handle graphs with multiple components
5. **Negative weights**: Should handle negative edge weights (Dijkstra may give incorrect results, but should not crash)
6. **Large graphs**: Should handle graphs with 1000+ nodes efficiently

## Implementation Notes

- Use adjacency list representation for memory efficiency
- Graph IDs should be unique within a session
- Traversal order for neighbors should be deterministic (e.g., alphabetical)
- Return consistent JSON structures for all responses
