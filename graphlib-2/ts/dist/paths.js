"use strict";
// Pathfinding algorithms: shortest_path, all_shortest_paths, has_path
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortestPath = shortestPath;
exports.allShortestPaths = allShortestPaths;
exports.hasPath = hasPath;
const graph_1 = require("./graph");
function shortestPath(graphId, startNode, endNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { exists: false, path: [], distance: -1 };
    }
    if (!graph.nodes.has(startNode) || !graph.nodes.has(endNode)) {
        return { exists: false, path: [], distance: -1 };
    }
    // Same node
    if (startNode === endNode) {
        return { exists: true, path: [startNode], distance: 0 };
    }
    // Use BFS for unweighted, Dijkstra for weighted
    if (!graph.weighted) {
        return bfsShortestPath(graph, startNode, endNode);
    }
    else {
        return dijkstraShortestPath(graph, startNode, endNode);
    }
}
function bfsShortestPath(graph, startNode, endNode) {
    if (!graph)
        return { exists: false, path: [], distance: -1 };
    const visited = new Set();
    const parent = new Map();
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === endNode) {
            // Reconstruct path
            const path = [];
            let node = endNode;
            while (node !== undefined) {
                path.unshift(node);
                node = parent.get(node);
            }
            return { exists: true, path, distance: path.length - 1 };
        }
        const neighbors = Array.from(graph.adjacency.get(current)?.keys() ?? []).sort();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }
    return { exists: false, path: [], distance: -1 };
}
function dijkstraShortestPath(graph, startNode, endNode) {
    if (!graph)
        return { exists: false, path: [], distance: -1 };
    const dist = new Map();
    const parent = new Map();
    const visited = new Set();
    // Initialize distances
    for (const node of graph.nodes) {
        dist.set(node, Infinity);
    }
    dist.set(startNode, 0);
    // Priority queue simulation (simple array-based)
    const pq = [{ node: startNode, dist: 0 }];
    while (pq.length > 0) {
        // Find min distance node
        pq.sort((a, b) => a.dist - b.dist);
        const { node: current, dist: currentDist } = pq.shift();
        if (visited.has(current))
            continue;
        visited.add(current);
        if (current === endNode) {
            // Reconstruct path
            const path = [];
            let node = endNode;
            while (node !== undefined) {
                path.unshift(node);
                node = parent.get(node);
            }
            return { exists: true, path, distance: currentDist };
        }
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            for (const [neighbor, weight] of neighbors) {
                if (!visited.has(neighbor)) {
                    const newDist = currentDist + weight;
                    if (newDist < dist.get(neighbor)) {
                        dist.set(neighbor, newDist);
                        parent.set(neighbor, current);
                        pq.push({ node: neighbor, dist: newDist });
                    }
                }
            }
        }
    }
    return { exists: false, path: [], distance: -1 };
}
function allShortestPaths(graphId, startNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || !graph.nodes.has(startNode)) {
        return { distances: {}, paths: {}, unreachable: [] };
    }
    const distances = {};
    const paths = {};
    const unreachable = [];
    const parent = new Map();
    if (!graph.weighted) {
        // BFS for unweighted
        const visited = new Set();
        const queue = [startNode];
        visited.add(startNode);
        distances[startNode] = 0;
        paths[startNode] = [startNode];
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = Array.from(graph.adjacency.get(current)?.keys() ?? []).sort();
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                    parent.set(neighbor, current);
                    distances[neighbor] = distances[current] + 1;
                    // Reconstruct path
                    const path = [];
                    let node = neighbor;
                    while (node !== undefined) {
                        path.unshift(node);
                        node = parent.get(node);
                    }
                    paths[neighbor] = path;
                }
            }
        }
    }
    else {
        // Dijkstra for weighted
        const dist = new Map();
        const visited = new Set();
        for (const node of graph.nodes) {
            dist.set(node, Infinity);
        }
        dist.set(startNode, 0);
        distances[startNode] = 0;
        paths[startNode] = [startNode];
        const pq = [{ node: startNode, dist: 0 }];
        while (pq.length > 0) {
            pq.sort((a, b) => a.dist - b.dist);
            const { node: current, dist: currentDist } = pq.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            const neighbors = graph.adjacency.get(current);
            if (neighbors) {
                for (const [neighbor, weight] of neighbors) {
                    if (!visited.has(neighbor)) {
                        const newDist = currentDist + weight;
                        if (newDist < dist.get(neighbor)) {
                            dist.set(neighbor, newDist);
                            parent.set(neighbor, current);
                            distances[neighbor] = newDist;
                            // Reconstruct path
                            const path = [];
                            let node = neighbor;
                            while (node !== undefined) {
                                path.unshift(node);
                                node = parent.get(node);
                            }
                            paths[neighbor] = path;
                            pq.push({ node: neighbor, dist: newDist });
                        }
                    }
                }
            }
        }
    }
    // Find unreachable nodes
    for (const node of graph.nodes) {
        if (!(node in distances)) {
            unreachable.push(node);
        }
    }
    unreachable.sort();
    return { distances, paths, unreachable };
}
function hasPath(graphId, startNode, endNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { exists: false };
    }
    if (!graph.nodes.has(startNode) || !graph.nodes.has(endNode)) {
        return { exists: false };
    }
    if (startNode === endNode) {
        return { exists: true };
    }
    // BFS to check reachability
    const visited = new Set();
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === endNode) {
            return { exists: true };
        }
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            for (const neighbor of neighbors.keys()) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return { exists: false };
}
