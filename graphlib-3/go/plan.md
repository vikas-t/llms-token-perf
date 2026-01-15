# Graph Algorithm Library: Go Implementation

## Task

Implement a graph algorithm library in Go. All 150 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `go/` directory
- Run any bash commands (go build, go mod, pytest, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party graph libraries
- Only Go standard library is allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `go/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `ts/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 150 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the test interface.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
go/
├── go.mod
├── main.go              # CLI entry point for testing (under 100 lines)
└── graphlib/            # Package directory
    ├── types.go         # All type definitions
    ├── graph.go         # Graph struct, add/remove nodes/edges, basic operations
    ├── traversal.go     # BFS, DFS implementations
    ├── paths.go         # shortest_path, all_shortest_paths, has_path (Dijkstra)
    └── components.go    # connected_components, strongly_connected_components, has_cycle, topological_sort
```

**MANDATORY REQUIREMENTS:**
- `main.go` MUST be under 100 lines - it only provides CLI interface for tests
- Each module (`types.go`, `graph.go`, `traversal.go`, `paths.go`, `components.go`) MUST exist as a separate file in graphlib/
- **MINIMUM 6 .go FILES REQUIRED** (1 main + 5 in graphlib/)
- This structure is REQUIRED and will be verified

### Module Responsibilities

**types.go:**
- Type definitions for Graph, Node, Edge structs
- Any helper types needed

**graph.go:**
- `CreateGraph(options)` - Create a new graph (directed/weighted)
- `AddNode(graphID, nodeID)` - Add a node to graph
- `AddEdge(graphID, from, to, weight)` - Add an edge between nodes
- `RemoveNode(graphID, nodeID)` - Remove node and incident edges
- `RemoveEdge(graphID, from, to)` - Remove an edge
- `GetNodes(graphID)` - Get all nodes
- `GetEdges(graphID)` - Get all edges
- `GetNeighbors(graphID, nodeID)` - Get neighbors of a node
- `HasNode(graphID, nodeID)` - Check if node exists
- `HasEdge(graphID, from, to)` - Check if edge exists
- `GetDegree(graphID, nodeID)` - Get node degree
- `GetGraphInfo(graphID)` - Get graph metadata
- `ClearGraph(graphID)` - Remove all nodes/edges
- `CloneGraph(graphID)` - Create copy of graph
- `Subgraph(graphID, nodes)` - Create subgraph

**traversal.go:**
- `BFS(graphID, start)` - Breadth-first search traversal
- `DFS(graphID, start)` - Depth-first search traversal

**paths.go:**
- `ShortestPath(graphID, start, end)` - Find shortest path
- `AllShortestPaths(graphID, start)` - Dijkstra from source
- `HasPath(graphID, start, end)` - Check path existence

**components.go:**
- `HasCycle(graphID)` - Detect cycles
- `IsDAG(graphID)` - Check if directed acyclic graph
- `TopologicalSort(graphID)` - Topological ordering
- `ConnectedComponents(graphID)` - Find connected components
- `StronglyConnectedComponents(graphID)` - Find SCCs (Tarjan's or Kosaraju's)
- `IsConnected(graphID)` - Check connectivity

**main.go:**
- Read command from os.Args[1]
- Read JSON input from stdin
- Call appropriate function from graphlib package
- Output JSON result to stdout

## Setup

Initialize Go module:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/graphlib-3/go
go mod init graphlib
```

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/graphlib-3/go
go build -o graphlib .
cd ..
IMPL=go pytest tests -v
```

## Success Criteria

- All 150 tests pass
- Implementation only in `go/` directory
- `go build` succeeds without errors
- **MUST have modular structure with 6 .go files** (1 main + 5 in graphlib/)
- **`main.go` MUST be under 100 lines**
- Each function in the correct module as specified above
