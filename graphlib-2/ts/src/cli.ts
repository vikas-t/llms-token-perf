// CLI wrapper for graph library
import * as graph from './graph';
import * as traversal from './traversal';
import * as paths from './paths';
import * as components from './components';

const command = process.argv[2];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const args = JSON.parse(input);
  let result: unknown;
  switch (command) {
    case 'create_graph': result = graph.createGraph(args[0] || {}); break;
    case 'add_node': result = graph.addNode(args[0], args[1]); break;
    case 'add_edge': result = graph.addEdge(args[0], args[1], args[2], args[3]); break;
    case 'remove_node': result = graph.removeNode(args[0], args[1]); break;
    case 'remove_edge': result = graph.removeEdge(args[0], args[1], args[2]); break;
    case 'get_nodes': result = graph.getNodes(args[0]); break;
    case 'get_edges': result = graph.getEdges(args[0]); break;
    case 'get_neighbors': result = graph.getNeighbors(args[0], args[1]); break;
    case 'has_node': result = graph.hasNode(args[0], args[1]); break;
    case 'has_edge': result = graph.hasEdge(args[0], args[1], args[2]); break;
    case 'get_degree': result = graph.getDegree(args[0], args[1]); break;
    case 'bfs': result = traversal.bfs(args[0], args[1]); break;
    case 'dfs': result = traversal.dfs(args[0], args[1]); break;
    case 'shortest_path': result = paths.shortestPath(args[0], args[1], args[2]); break;
    case 'all_shortest_paths': result = paths.allShortestPaths(args[0], args[1]); break;
    case 'has_path': result = paths.hasPath(args[0], args[1], args[2]); break;
    case 'has_cycle': result = components.hasCycle(args[0]); break;
    case 'is_dag': result = components.isDAG(args[0]); break;
    case 'topological_sort': result = components.topologicalSort(args[0]); break;
    case 'connected_components': result = components.connectedComponents(args[0]); break;
    case 'strongly_connected_components': result = components.stronglyConnectedComponents(args[0]); break;
    case 'is_connected': result = components.isConnected(args[0]); break;
    case 'get_graph_info': result = graph.getGraphInfo(args[0]); break;
    case 'clear_graph': result = graph.clearGraph(args[0]); break;
    case 'clone_graph': result = graph.cloneGraph(args[0]); break;
    case 'subgraph': result = graph.subgraph(args[0], args[1]); break;
    default: result = { error: `Unknown command: ${command}` };
  }
  console.log(JSON.stringify(result));
});
