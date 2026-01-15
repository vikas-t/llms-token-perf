"use strict";
// Graph class and basic operations
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
const storage_1 = require("./storage");
function getGraph(graphId) {
    return (0, storage_1.loadGraph)(graphId);
}
function createGraph(options = {}) {
    const id = (0, storage_1.getNextId)();
    const graph = {
        id,
        directed: options.directed ?? false,
        weighted: options.weighted ?? false,
        nodes: new Set(),
        adjacency: new Map(),
        inEdges: new Map(),
    };
    (0, storage_1.storeGraph)(graph);
    return {
        id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: 0,
        edge_count: 0,
    };
}
function addNode(graphId, nodeId) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    if (graph.nodes.has(nodeId)) {
        return { success: false, error: 'node_already_exists' };
    }
    graph.nodes.add(nodeId);
    graph.adjacency.set(nodeId, new Map());
    graph.inEdges.set(nodeId, new Map());
    (0, storage_1.storeGraph)(graph);
    return { success: true, node_id: nodeId };
}
function addEdge(graphId, fromNode, toNode, weight) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    // Auto-create nodes if they don't exist
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
    // Check if edge already exists
    if (graph.adjacency.get(fromNode).has(toNode)) {
        return { success: false, error: 'edge_already_exists' };
    }
    // Add edge
    graph.adjacency.get(fromNode).set(toNode, edgeWeight);
    graph.inEdges.get(toNode).set(fromNode, edgeWeight);
    // For undirected graphs, add reverse edge
    if (!graph.directed) {
        graph.adjacency.get(toNode).set(fromNode, edgeWeight);
        graph.inEdges.get(fromNode).set(toNode, edgeWeight);
    }
    (0, storage_1.storeGraph)(graph);
    return { success: true, from: fromNode, to: toNode, weight: edgeWeight };
}
function removeNode(graphId, nodeId) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    if (!graph.nodes.has(nodeId)) {
        return { success: false, error: 'node_not_found' };
    }
    let removedEdges = 0;
    // Count outgoing edges from this node
    const outgoing = graph.adjacency.get(nodeId);
    if (outgoing) {
        removedEdges += outgoing.size;
        // Remove from inEdges of target nodes
        for (const target of outgoing.keys()) {
            graph.inEdges.get(target)?.delete(nodeId);
        }
    }
    // Count incoming edges to this node
    const incoming = graph.inEdges.get(nodeId);
    if (incoming) {
        // For directed graphs, count separately; for undirected, already counted
        if (graph.directed) {
            removedEdges += incoming.size;
        }
        // Remove from adjacency of source nodes
        for (const source of incoming.keys()) {
            graph.adjacency.get(source)?.delete(nodeId);
        }
    }
    // Remove the node itself
    graph.nodes.delete(nodeId);
    graph.adjacency.delete(nodeId);
    graph.inEdges.delete(nodeId);
    (0, storage_1.storeGraph)(graph);
    return { success: true, removed_edges: removedEdges };
}
function removeEdge(graphId, fromNode, toNode) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    const fromAdj = graph.adjacency.get(fromNode);
    if (!fromAdj || !fromAdj.has(toNode)) {
        return { success: false, error: 'edge_not_found' };
    }
    // Remove edge
    fromAdj.delete(toNode);
    graph.inEdges.get(toNode)?.delete(fromNode);
    // For undirected, remove reverse edge
    if (!graph.directed) {
        graph.adjacency.get(toNode)?.delete(fromNode);
        graph.inEdges.get(fromNode)?.delete(toNode);
    }
    (0, storage_1.storeGraph)(graph);
    return { success: true };
}
function getNodes(graphId) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { nodes: [], count: 0 };
    }
    const nodes = Array.from(graph.nodes).sort();
    return { nodes, count: nodes.length };
}
function getEdges(graphId) {
    const graph = (0, storage_1.loadGraph)(graphId);
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
    const graph = (0, storage_1.loadGraph)(graphId);
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
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { exists: false };
    }
    return { exists: graph.nodes.has(nodeId) };
}
function hasEdge(graphId, fromNode, toNode) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { exists: false };
    }
    const adj = graph.adjacency.get(fromNode);
    if (!adj || !adj.has(toNode)) {
        return { exists: false };
    }
    return { exists: true, weight: adj.get(toNode) };
}
function getDegree(graphId, nodeId) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { degree: 0, in_degree: 0, out_degree: 0 };
    }
    const outDegree = graph.adjacency.get(nodeId)?.size ?? 0;
    const inDegree = graph.inEdges.get(nodeId)?.size ?? 0;
    if (graph.directed) {
        return {
            degree: outDegree + inDegree,
            in_degree: inDegree,
            out_degree: outDegree,
        };
    }
    else {
        // For undirected, in_degree = out_degree = degree
        return {
            degree: outDegree,
            in_degree: outDegree,
            out_degree: outDegree,
        };
    }
}
function getGraphInfo(graphId) {
    const graph = (0, storage_1.loadGraph)(graphId);
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
    const edgesResult = getEdges(graphId);
    // Inline connectivity check to avoid circular dependency
    let isConn = true;
    if (graph.nodes.size > 1) {
        const visited = new Set();
        const startNode = graph.nodes.values().next().value;
        const queue = [startNode];
        visited.add(startNode);
        while (queue.length > 0) {
            const current = queue.shift();
            const outNeighbors = graph.adjacency.get(current) ?? new Map();
            const inNeighbors = graph.inEdges.get(current) ?? new Map();
            const allNeighbors = new Set([...outNeighbors.keys(), ...inNeighbors.keys()]);
            for (const neighbor of allNeighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        isConn = visited.size === graph.nodes.size;
    }
    // Inline cycle check
    let hasCycleResult = false;
    if (graph.nodes.size > 0) {
        if (graph.directed) {
            const WHITE = 0, GRAY = 1, BLACK = 2;
            const color = new Map();
            for (const node of graph.nodes)
                color.set(node, WHITE);
            const dfs = (node) => {
                color.set(node, GRAY);
                for (const neighbor of graph.adjacency.get(node)?.keys() ?? []) {
                    if (color.get(neighbor) === GRAY)
                        return true;
                    if (color.get(neighbor) === WHITE && dfs(neighbor))
                        return true;
                }
                color.set(node, BLACK);
                return false;
            };
            for (const node of graph.nodes) {
                if (color.get(node) === WHITE && dfs(node)) {
                    hasCycleResult = true;
                    break;
                }
            }
        }
        else {
            const visited = new Set();
            const dfs = (node, parent) => {
                visited.add(node);
                for (const neighbor of graph.adjacency.get(node)?.keys() ?? []) {
                    if (!visited.has(neighbor)) {
                        if (dfs(neighbor, node))
                            return true;
                    }
                    else if (neighbor !== parent) {
                        return true;
                    }
                }
                return false;
            };
            for (const node of graph.nodes) {
                if (!visited.has(node) && dfs(node, null)) {
                    hasCycleResult = true;
                    break;
                }
            }
        }
    }
    return {
        id: graph.id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: graph.nodes.size,
        edge_count: edgesResult.count,
        is_connected: isConn,
        has_cycle: hasCycleResult,
    };
}
function clearGraph(graphId) {
    const graph = (0, storage_1.loadGraph)(graphId);
    if (!graph) {
        return { success: false };
    }
    graph.nodes.clear();
    graph.adjacency.clear();
    graph.inEdges.clear();
    (0, storage_1.storeGraph)(graph);
    return { success: true };
}
function cloneGraph(graphId) {
    const graph = (0, storage_1.loadGraph)(graphId);
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
    const newGraph = (0, storage_1.loadGraph)(newGraphResult.id);
    // Copy nodes
    for (const node of graph.nodes) {
        newGraph.nodes.add(node);
        newGraph.adjacency.set(node, new Map());
        newGraph.inEdges.set(node, new Map());
    }
    // Copy edges
    for (const [from, neighbors] of graph.adjacency) {
        for (const [to, weight] of neighbors) {
            newGraph.adjacency.get(from).set(to, weight);
            newGraph.inEdges.get(to).set(from, weight);
        }
    }
    (0, storage_1.storeGraph)(newGraph);
    const edges = getEdges(newGraphResult.id);
    return {
        id: newGraphResult.id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: newGraph.nodes.size,
        edge_count: edges.count,
    };
}
function subgraph(graphId, nodeList) {
    const graph = (0, storage_1.loadGraph)(graphId);
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
    const newGraph = (0, storage_1.loadGraph)(newGraphResult.id);
    const nodeSet = new Set(nodeList);
    // Add nodes that exist in original graph
    for (const node of nodeList) {
        if (graph.nodes.has(node)) {
            newGraph.nodes.add(node);
            newGraph.adjacency.set(node, new Map());
            newGraph.inEdges.set(node, new Map());
        }
    }
    // Add edges between selected nodes
    for (const from of nodeList) {
        const adj = graph.adjacency.get(from);
        if (adj) {
            for (const [to, weight] of adj) {
                if (nodeSet.has(to)) {
                    newGraph.adjacency.get(from).set(to, weight);
                    newGraph.inEdges.get(to).set(from, weight);
                }
            }
        }
    }
    (0, storage_1.storeGraph)(newGraph);
    const edges = getEdges(newGraphResult.id);
    return {
        id: newGraphResult.id,
        directed: graph.directed,
        weighted: graph.weighted,
        node_count: newGraph.nodes.size,
        edge_count: edges.count,
    };
}
