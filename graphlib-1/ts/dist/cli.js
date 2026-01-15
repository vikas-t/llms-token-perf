"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const lib = __importStar(require("./index"));
const command = process.argv[2];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
    const args = JSON.parse(input || '[]');
    const result = executeCommand(command, args);
    console.log(JSON.stringify(result));
});
function executeCommand(cmd, args) {
    switch (cmd) {
        case 'create_graph':
            return lib.createGraph(args[0] || {});
        case 'add_node':
            return lib.addNode(args[0], args[1]);
        case 'add_edge':
            return lib.addEdge(args[0], args[1], args[2], args[3]);
        case 'remove_node':
            return lib.removeNode(args[0], args[1]);
        case 'remove_edge':
            return lib.removeEdge(args[0], args[1], args[2]);
        case 'get_nodes':
            return lib.getNodes(args[0]);
        case 'get_edges':
            return lib.getEdges(args[0]);
        case 'get_neighbors':
            return lib.getNeighbors(args[0], args[1]);
        case 'has_node':
            return lib.hasNode(args[0], args[1]);
        case 'has_edge':
            return lib.hasEdge(args[0], args[1], args[2]);
        case 'get_degree':
            return lib.getDegree(args[0], args[1]);
        case 'bfs':
            return lib.bfs(args[0], args[1]);
        case 'dfs':
            return lib.dfs(args[0], args[1]);
        case 'shortest_path':
            return lib.shortestPath(args[0], args[1], args[2]);
        case 'all_shortest_paths':
            return lib.allShortestPaths(args[0], args[1]);
        case 'has_path':
            return lib.hasPath(args[0], args[1], args[2]);
        case 'has_cycle':
            return lib.hasCycle(args[0]);
        case 'is_dag':
            return lib.isDag(args[0]);
        case 'topological_sort':
            return lib.topologicalSort(args[0]);
        case 'connected_components':
            return lib.connectedComponents(args[0]);
        case 'strongly_connected_components':
            return lib.stronglyConnectedComponents(args[0]);
        case 'is_connected':
            return lib.isConnected(args[0]);
        case 'get_graph_info':
            return lib.getGraphInfo(args[0]);
        case 'clear_graph':
            return lib.clearGraph(args[0]);
        case 'clone_graph':
            return lib.cloneGraph(args[0]);
        case 'subgraph':
            return lib.subgraph(args[0], args[1]);
        default:
            return { error: `Unknown command: ${cmd}` };
    }
}
