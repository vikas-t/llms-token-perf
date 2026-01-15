import * as lib from './index';

const command = process.argv[2];
let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const args = JSON.parse(input || '[]');
  const result = executeCommand(command, args);
  console.log(JSON.stringify(result));
});

function executeCommand(cmd: string, args: unknown[]): unknown {
  switch (cmd) {
    case 'create_graph':
      return lib.createGraph(args[0] as { directed?: boolean; weighted?: boolean } || {});
    case 'add_node':
      return lib.addNode(args[0] as string, args[1] as string);
    case 'add_edge':
      return lib.addEdge(args[0] as string, args[1] as string, args[2] as string, args[3] as number | undefined);
    case 'remove_node':
      return lib.removeNode(args[0] as string, args[1] as string);
    case 'remove_edge':
      return lib.removeEdge(args[0] as string, args[1] as string, args[2] as string);
    case 'get_nodes':
      return lib.getNodes(args[0] as string);
    case 'get_edges':
      return lib.getEdges(args[0] as string);
    case 'get_neighbors':
      return lib.getNeighbors(args[0] as string, args[1] as string);
    case 'has_node':
      return lib.hasNode(args[0] as string, args[1] as string);
    case 'has_edge':
      return lib.hasEdge(args[0] as string, args[1] as string, args[2] as string);
    case 'get_degree':
      return lib.getDegree(args[0] as string, args[1] as string);
    case 'bfs':
      return lib.bfs(args[0] as string, args[1] as string);
    case 'dfs':
      return lib.dfs(args[0] as string, args[1] as string);
    case 'shortest_path':
      return lib.shortestPath(args[0] as string, args[1] as string, args[2] as string);
    case 'all_shortest_paths':
      return lib.allShortestPaths(args[0] as string, args[1] as string);
    case 'has_path':
      return lib.hasPath(args[0] as string, args[1] as string, args[2] as string);
    case 'has_cycle':
      return lib.hasCycle(args[0] as string);
    case 'is_dag':
      return lib.isDag(args[0] as string);
    case 'topological_sort':
      return lib.topologicalSort(args[0] as string);
    case 'connected_components':
      return lib.connectedComponents(args[0] as string);
    case 'strongly_connected_components':
      return lib.stronglyConnectedComponents(args[0] as string);
    case 'is_connected':
      return lib.isConnected(args[0] as string);
    case 'get_graph_info':
      return lib.getGraphInfo(args[0] as string);
    case 'clear_graph':
      return lib.clearGraph(args[0] as string);
    case 'clone_graph':
      return lib.cloneGraph(args[0] as string);
    case 'subgraph':
      return lib.subgraph(args[0] as string, args[1] as string[]);
    default:
      return { error: `Unknown command: ${cmd}` };
  }
}
