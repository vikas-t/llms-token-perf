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
exports.getGraph = getGraph;
exports.createGraph = createGraph;
exports.addNode = addNode;
exports.addEdge = addEdge;
exports.removeNode = removeNode;
exports.removeEdge = removeEdge;
exports.getNodes = getNodes;
exports.getEdges = getEdges;
exports.getNeighbors = getNeighbors;
exports.hasNode = hasNode;
exports.hasEdge = hasEdge;
exports.getDegree = getDegree;
exports.getGraphInfo = getGraphInfo;
exports.clearGraph = clearGraph;
exports.cloneGraph = cloneGraph;
exports.subgraph = subgraph;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_FILE = path.join(__dirname, '..', 'data', 'graphs.json');
function ensureDataDir() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function loadData() {
    ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(content);
    }
    return { graphs: {}, counter: 0 };
}
function saveData(data) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}
function serializeGraph(g) {
    const edges = [];
    const seen = new Set();
    for (const [from, neighbors] of g.adjacency) {
        for (const [to, weight] of neighbors) {
            const key = g.directed ? `${from}->${to}` : [from, to].sort().join('-');
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({ from, to, weight });
            }
        }
    }
    return {
        id: g.id,
        directed: g.directed,
        weighted: g.weighted,
        nodes: Array.from(g.nodes),
        edges,
    };
}
function deserializeGraph(s) {
    const g = {
        id: s.id,
        directed: s.directed,
        weighted: s.weighted,
        nodes: new Set(s.nodes),
        adjacency: new Map(),
        inEdges: new Map(),
    };
    for (const node of s.nodes) {
        g.adjacency.set(node, new Map());
        g.inEdges.set(node, new Map());
    }
    for (const e of s.edges) {
        g.adjacency.get(e.from).set(e.to, e.weight);
        g.inEdges.get(e.to).set(e.from, e.weight);
        if (!s.directed && e.from !== e.to) {
            g.adjacency.get(e.to).set(e.from, e.weight);
            g.inEdges.get(e.from).set(e.to, e.weight);
        }
    }
    return g;
}
function getGraph(graphId) {
    const data = loadData();
    const s = data.graphs[graphId];
    if (!s)
        return undefined;
    return deserializeGraph(s);
}
function saveGraph(g) {
    const data = loadData();
    data.graphs[g.id] = serializeGraph(g);
    saveData(data);
}
function createGraph(options = {}) {
    const data = loadData();
    data.counter++;
    const id = `graph-${data.counter}`;
    const graph = {
        id,
        directed: options.directed ?? false,
        weighted: options.weighted ?? false,
        nodes: [],
        edges: [],
    };
    data.graphs[id] = graph;
    saveData(data);
    return {
        id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: 0,
        edge_count: 0,
    };
}
function addNode(graphId, nodeId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    if (graph.nodes.has(nodeId)) {
        return { success: false, error: 'node_already_exists' };
    }
    graph.nodes.add(nodeId);
    graph.adjacency.set(nodeId, new Map());
    graph.inEdges.set(nodeId, new Map());
    saveGraph(graph);
    return { success: true, node_id: nodeId };
}
function addEdge(graphId, fromNode, toNode, weight) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    // Auto-create nodes
    if (!graph.nodes.has(fromNode)) {
        graph.nodes.add(fromNode);
        graph.adjacency.set(fromNode, new Map());
        graph.inEdges.set(fromNode, new Map());
    }
    if (!graph.nodes.has(toNode)) {
        graph.nodes.add(toNode);
        graph.adjacency.set(toNode, new Map());
        graph.inEdges.set(toNode, new Map());
    }
    const edgeWeight = weight ?? 1.0;
    const fromAdj = graph.adjacency.get(fromNode);
    // Check for existing edge
    if (fromAdj.has(toNode)) {
        return { success: false, error: 'edge_already_exists' };
    }
    // Add edge
    fromAdj.set(toNode, edgeWeight);
    graph.inEdges.get(toNode).set(fromNode, edgeWeight);
    // For undirected, add reverse edge
    if (!graph.directed && fromNode !== toNode) {
        graph.adjacency.get(toNode).set(fromNode, edgeWeight);
        graph.inEdges.get(fromNode).set(toNode, edgeWeight);
    }
    saveGraph(graph);
    return { success: true, from: fromNode, to: toNode, weight: edgeWeight };
}
function removeNode(graphId, nodeId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    if (!graph.nodes.has(nodeId)) {
        return { success: false, error: 'node_not_found' };
    }
    let removedEdges = 0;
    // Count and remove outgoing edges
    const outgoing = graph.adjacency.get(nodeId);
    if (outgoing) {
        removedEdges += outgoing.size;
        for (const neighbor of outgoing.keys()) {
            graph.inEdges.get(neighbor)?.delete(nodeId);
        }
    }
    // Count and remove incoming edges
    const incoming = graph.inEdges.get(nodeId);
    if (incoming) {
        for (const neighbor of incoming.keys()) {
            if (graph.directed || neighbor === nodeId) {
                removedEdges++;
            }
            graph.adjacency.get(neighbor)?.delete(nodeId);
        }
    }
    graph.nodes.delete(nodeId);
    graph.adjacency.delete(nodeId);
    graph.inEdges.delete(nodeId);
    saveGraph(graph);
    return { success: true, removed_edges: removedEdges };
}
function removeEdge(graphId, fromNode, toNode) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    const fromAdj = graph.adjacency.get(fromNode);
    if (!fromAdj || !fromAdj.has(toNode)) {
        return { success: false, error: 'edge_not_found' };
    }
    fromAdj.delete(toNode);
    graph.inEdges.get(toNode)?.delete(fromNode);
    if (!graph.directed && fromNode !== toNode) {
        graph.adjacency.get(toNode)?.delete(fromNode);
        graph.inEdges.get(fromNode)?.delete(toNode);
    }
    saveGraph(graph);
    return { success: true };
}
function getNodes(graphId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { nodes: [], count: 0 };
    }
    const nodes = Array.from(graph.nodes).sort();
    return { nodes, count: nodes.length };
}
function getEdges(graphId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { edges: [], count: 0 };
    }
    const edges = [];
    const seen = new Set();
    for (const [from, neighbors] of graph.adjacency) {
        for (const [to, weight] of neighbors) {
            const key = graph.directed ? `${from}->${to}` : [from, to].sort().join('-');
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({ from, to, weight });
            }
        }
    }
    return { edges, count: edges.length };
}
function getNeighbors(graphId, nodeId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { neighbors: [], count: 0 };
    }
    const adj = graph.adjacency.get(nodeId);
    if (!adj) {
        return { neighbors: [], count: 0 };
    }
    const neighbors = Array.from(adj.keys()).sort();
    return { neighbors, count: neighbors.length };
}
function hasNode(graphId, nodeId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { exists: false };
    }
    return { exists: graph.nodes.has(nodeId) };
}
function hasEdge(graphId, fromNode, toNode) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { exists: false };
    }
    const fromAdj = graph.adjacency.get(fromNode);
    if (!fromAdj || !fromAdj.has(toNode)) {
        return { exists: false };
    }
    return { exists: true, weight: fromAdj.get(toNode) };
}
function getDegree(graphId, nodeId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { degree: 0, in_degree: 0, out_degree: 0 };
    }
    const outAdj = graph.adjacency.get(nodeId);
    const inAdj = graph.inEdges.get(nodeId);
    const outDegree = outAdj ? outAdj.size : 0;
    const inDegree = inAdj ? inAdj.size : 0;
    if (graph.directed) {
        return {
            degree: inDegree + outDegree,
            in_degree: inDegree,
            out_degree: outDegree,
        };
    }
    else {
        return {
            degree: outDegree,
            in_degree: outDegree,
            out_degree: outDegree,
        };
    }
}
function getGraphInfo(graphId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return {
            id: graphId,
            directed: false,
            weighted: false,
            node_count: 0,
            edge_count: 0,
            is_connected: true,
            has_cycle: false,
        };
    }
    // Import these dynamically to avoid circular dependency
    const { hasCycle, isConnected } = require('./components');
    const edges = getEdges(graphId);
    const connResult = isConnected(graphId);
    const cycleResult = hasCycle(graphId);
    return {
        id: graph.id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: graph.nodes.size,
        edge_count: edges.count,
        is_connected: connResult.is_connected,
        has_cycle: cycleResult.has_cycle,
    };
}
function clearGraph(graphId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return { success: false };
    }
    graph.nodes.clear();
    graph.adjacency.clear();
    graph.inEdges.clear();
    saveGraph(graph);
    return { success: true };
}
function cloneGraph(graphId) {
    const graph = getGraph(graphId);
    if (!graph) {
        return {
            id: '',
            directed: false,
            weighted: false,
            node_count: 0,
            edge_count: 0,
        };
    }
    const newGraphResult = createGraph({
        directed: graph.directed,
        weighted: graph.weighted,
    });
    const newGraph = getGraph(newGraphResult.id);
    // Copy nodes
    for (const node of graph.nodes) {
        newGraph.nodes.add(node);
        newGraph.adjacency.set(node, new Map());
        newGraph.inEdges.set(node, new Map());
    }
    // Copy edges
    const seen = new Set();
    for (const [from, neighbors] of graph.adjacency) {
        for (const [to, weight] of neighbors) {
            const key = graph.directed ? `${from}->${to}` : [from, to].sort().join('-');
            if (!seen.has(key)) {
                seen.add(key);
                newGraph.adjacency.get(from).set(to, weight);
                newGraph.inEdges.get(to).set(from, weight);
                if (!graph.directed && from !== to) {
                    newGraph.adjacency.get(to).set(from, weight);
                    newGraph.inEdges.get(from).set(to, weight);
                }
            }
        }
    }
    saveGraph(newGraph);
    const edges = getEdges(newGraphResult.id);
    return {
        id: newGraphResult.id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: graph.nodes.size,
        edge_count: edges.count,
    };
}
function subgraph(graphId, nodeList) {
    const graph = getGraph(graphId);
    if (!graph) {
        return {
            id: '',
            directed: false,
            weighted: false,
            node_count: 0,
            edge_count: 0,
        };
    }
    const nodeSet = new Set(nodeList);
    const newGraphResult = createGraph({
        directed: graph.directed,
        weighted: graph.weighted,
    });
    const newGraph = getGraph(newGraphResult.id);
    // Add nodes that exist in original graph
    for (const node of nodeList) {
        if (graph.nodes.has(node)) {
            newGraph.nodes.add(node);
            newGraph.adjacency.set(node, new Map());
            newGraph.inEdges.set(node, new Map());
        }
    }
    // Add edges between selected nodes
    const seen = new Set();
    for (const [from, neighbors] of graph.adjacency) {
        if (!nodeSet.has(from))
            continue;
        for (const [to, weight] of neighbors) {
            if (!nodeSet.has(to))
                continue;
            const key = graph.directed ? `${from}->${to}` : [from, to].sort().join('-');
            if (!seen.has(key)) {
                seen.add(key);
                newGraph.adjacency.get(from).set(to, weight);
                newGraph.inEdges.get(to).set(from, weight);
                if (!graph.directed && from !== to) {
                    newGraph.adjacency.get(to).set(from, weight);
                    newGraph.inEdges.get(from).set(to, weight);
                }
            }
        }
    }
    saveGraph(newGraph);
    const edges = getEdges(newGraphResult.id);
    return {
        id: newGraphResult.id,
        directed: newGraph.directed,
        weighted: newGraph.weighted,
        node_count: newGraph.nodes.size,
        edge_count: edges.count,
    };
}
