#!/usr/bin/env python3
"""CLI wrapper for the graph library."""
import sys
import json
import graphlib

COMMANDS = {
    'create_graph': lambda args: graphlib.create_graph(args[0] if args else {}),
    'add_node': lambda args: graphlib.add_node(args[0], args[1]),
    'add_edge': lambda args: graphlib.add_edge(args[0], args[1], args[2], args[3] if len(args) > 3 else None),
    'remove_node': lambda args: graphlib.remove_node(args[0], args[1]),
    'remove_edge': lambda args: graphlib.remove_edge(args[0], args[1], args[2]),
    'get_nodes': lambda args: graphlib.get_nodes(args[0]),
    'get_edges': lambda args: graphlib.get_edges(args[0]),
    'get_neighbors': lambda args: graphlib.get_neighbors(args[0], args[1]),
    'has_node': lambda args: graphlib.has_node(args[0], args[1]),
    'has_edge': lambda args: graphlib.has_edge(args[0], args[1], args[2]),
    'get_degree': lambda args: graphlib.get_degree(args[0], args[1]),
    'bfs': lambda args: graphlib.bfs(args[0], args[1]),
    'dfs': lambda args: graphlib.dfs(args[0], args[1]),
    'shortest_path': lambda args: graphlib.shortest_path(args[0], args[1], args[2]),
    'all_shortest_paths': lambda args: graphlib.all_shortest_paths(args[0], args[1]),
    'has_path': lambda args: graphlib.has_path(args[0], args[1], args[2]),
    'has_cycle': lambda args: graphlib.has_cycle(args[0]),
    'is_dag': lambda args: graphlib.is_dag(args[0]),
    'topological_sort': lambda args: graphlib.topological_sort(args[0]),
    'connected_components': lambda args: graphlib.connected_components(args[0]),
    'strongly_connected_components': lambda args: graphlib.strongly_connected_components(args[0]),
    'is_connected': lambda args: graphlib.is_connected(args[0]),
    'get_graph_info': lambda args: graphlib.get_graph_info(args[0]),
    'clear_graph': lambda args: graphlib.clear_graph(args[0]),
    'clone_graph': lambda args: graphlib.clone_graph(args[0]),
    'subgraph': lambda args: graphlib.subgraph(args[0], args[1]),
}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.exit(1)
    args = json.loads(sys.stdin.read())
    result = COMMANDS[cmd](args)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
