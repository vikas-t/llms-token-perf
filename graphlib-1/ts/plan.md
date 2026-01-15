# Graph Algorithm Library: TypeScript Implementation

## Task

Implement a graph algorithm library in TypeScript. All 150 tests must pass.

## Permissions

You have full permission to:
- Create, write, edit, and delete any files within `ts/` directory
- Run any bash commands (npm install, npm run build, pytest, etc.)
- Run tests as many times as needed

**FORBIDDEN:**
- Do NOT install or use any third-party graph libraries
- Only standard TypeScript/JavaScript is allowed

Do NOT ask for confirmation. Just execute.

## Rules

**STRICT REQUIREMENTS:**

1. **Working Directory**: You MUST only create/edit files within `ts/`. All your code goes here.
2. **No Peeking**: You MUST NOT read, reference, or look at `py/` or `go/` directories. This is strictly forbidden.
3. **Exit Criteria**: All 150 tests must pass (100%). Do not stop until this is achieved.
4. **Allowed Reads**: You MAY read `tests/` directory and `spec.md` to understand the test interface.

## MANDATORY: Modular File Structure

**YOU MUST CREATE EXACTLY THIS STRUCTURE. THIS IS NOT OPTIONAL.**

```
ts/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts         # Package exports - re-exports public API (under 50 lines)
    ├── types.ts         # All type definitions (Graph, Edge, Node interfaces)
    ├── graph.ts         # Graph class, add/remove nodes/edges, basic operations
    ├── traversal.ts     # BFS, DFS implementations
    ├── paths.ts         # shortest_path, all_shortest_paths, has_path (Dijkstra)
    ├── components.ts    # connected_components, strongly_connected_components, has_cycle, topological_sort
    └── cli.ts           # CLI wrapper (under 100 lines)
```

**MANDATORY REQUIREMENTS:**
- `index.ts` MUST be under 50 lines - it only imports and re-exports from modules
- `cli.ts` MUST be under 100 lines - it only handles CLI interface
- Each module (`types.ts`, `graph.ts`, `traversal.ts`, `paths.ts`, `components.ts`) MUST exist as a separate file
- **MINIMUM 7 .ts FILES REQUIRED** in src/
- This structure is REQUIRED and will be verified

### Module Responsibilities

**types.ts:**
- Type definitions for Graph, Node, Edge
- Any interfaces or types needed

**graph.ts:**
- `create_graph(options)` - Create a new graph (directed/weighted)
- `add_node(graph_id, node_id)` - Add a node to graph
- `add_edge(graph_id, from, to, weight)` - Add an edge between nodes
- `remove_node(graph_id, node_id)` - Remove node and incident edges
- `remove_edge(graph_id, from, to)` - Remove an edge
- `get_nodes(graph_id)` - Get all nodes
- `get_edges(graph_id)` - Get all edges
- `get_neighbors(graph_id, node_id)` - Get neighbors of a node
- `has_node(graph_id, node_id)` - Check if node exists
- `has_edge(graph_id, from, to)` - Check if edge exists
- `get_degree(graph_id, node_id)` - Get node degree
- `get_graph_info(graph_id)` - Get graph metadata
- `clear_graph(graph_id)` - Remove all nodes/edges
- `clone_graph(graph_id)` - Create copy of graph
- `subgraph(graph_id, nodes)` - Create subgraph

**traversal.ts:**
- `bfs(graph_id, start)` - Breadth-first search traversal
- `dfs(graph_id, start)` - Depth-first search traversal

**paths.ts:**
- `shortest_path(graph_id, start, end)` - Find shortest path
- `all_shortest_paths(graph_id, start)` - Dijkstra from source
- `has_path(graph_id, start, end)` - Check path existence

**components.ts:**
- `has_cycle(graph_id)` - Detect cycles
- `is_dag(graph_id)` - Check if directed acyclic graph
- `topological_sort(graph_id)` - Topological ordering
- `connected_components(graph_id)` - Find connected components
- `strongly_connected_components(graph_id)` - Find SCCs (Tarjan's or Kosaraju's)
- `is_connected(graph_id)` - Check connectivity

**cli.ts:**
- Read command from process.argv[2]
- Read JSON input from stdin
- Call appropriate function
- Output JSON result to stdout

## Testing

Build and run tests:
```bash
cd /Users/vikas-t/ws/nq/llms-tokens-perf/graphlib-1/ts
npm install
npm run build
cd ..
IMPL=ts pytest tests -v
```

## Success Criteria

- All 150 tests pass
- Implementation only in `ts/` directory
- **MUST have modular structure with 7 .ts files in src/**
- **`index.ts` MUST be under 50 lines**
- **`cli.ts` MUST be under 100 lines**
- Each function in the correct module as specified above
