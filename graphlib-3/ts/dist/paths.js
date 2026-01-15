"use strict";
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
    if (startNode === endNode) {
        return { exists: true, path: [startNode], distance: 0 };
    }
    // Use Dijkstra for weighted, BFS for unweighted
    if (graph.weighted) {
        return dijkstra(graphId, startNode, endNode);
    }
    else {
        return bfsPath(graphId, startNode, endNode);
    }
}
function bfsPath(graphId, startNode, endNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    const parent = new Map();
    const visited = new Set();
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === endNode) {
            // Reconstruct path
            const path = [];
            let node = endNode;
            while (node) {
                path.unshift(node);
                node = parent.get(node);
            }
            return { exists: true, path, distance: path.length - 1 };
        }
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    parent.set(neighbor, current);
                    queue.push(neighbor);
                }
            }
        }
    }
    return { exists: false, path: [], distance: -1 };
}
function dijkstra(graphId, startNode, endNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    const distances = new Map();
    const parent = new Map();
    const visited = new Set();
    for (const node of graph.nodes) {
        distances.set(node, Infinity);
    }
    distances.set(startNode, 0);
    // Simple priority queue using array (adequate for correctness)
    const pq = [[0, startNode]];
    while (pq.length > 0) {
        // Find minimum
        pq.sort((a, b) => a[0] - b[0]);
        const [dist, current] = pq.shift();
        if (visited.has(current))
            continue;
        visited.add(current);
        if (current === endNode) {
            const path = [];
            let node = endNode;
            while (node) {
                path.unshift(node);
                node = parent.get(node);
            }
            return { exists: true, path, distance: dist };
        }
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            for (const [neighbor, weight] of neighbors) {
                if (!visited.has(neighbor)) {
                    const newDist = dist + weight;
                    if (newDist < distances.get(neighbor)) {
                        distances.set(neighbor, newDist);
                        parent.set(neighbor, current);
                        pq.push([newDist, neighbor]);
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
    const parent = new Map();
    const distMap = new Map();
    const visited = new Set();
    for (const node of graph.nodes) {
        distMap.set(node, Infinity);
    }
    distMap.set(startNode, 0);
    if (graph.weighted) {
        // Dijkstra
        const pq = [[0, startNode]];
        while (pq.length > 0) {
            pq.sort((a, b) => a[0] - b[0]);
            const [dist, current] = pq.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            const neighbors = graph.adjacency.get(current);
            if (neighbors) {
                for (const [neighbor, weight] of neighbors) {
                    if (!visited.has(neighbor)) {
                        const newDist = dist + weight;
                        if (newDist < distMap.get(neighbor)) {
                            distMap.set(neighbor, newDist);
                            parent.set(neighbor, current);
                            pq.push([newDist, neighbor]);
                        }
                    }
                }
            }
        }
    }
    else {
        // BFS
        const queue = [startNode];
        visited.add(startNode);
        while (queue.length > 0) {
            const current = queue.shift();
            const currentDist = distMap.get(current);
            const neighbors = graph.adjacency.get(current);
            if (neighbors) {
                const sortedNeighbors = Array.from(neighbors.keys()).sort();
                for (const neighbor of sortedNeighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        distMap.set(neighbor, currentDist + 1);
                        parent.set(neighbor, current);
                        queue.push(neighbor);
                    }
                }
            }
        }
    }
    const unreachable = [];
    for (const node of graph.nodes) {
        const dist = distMap.get(node);
        if (dist === Infinity) {
            unreachable.push(node);
        }
        else {
            distances[node] = dist;
            // Reconstruct path
            const path = [];
            let current = node;
            while (current) {
                path.unshift(current);
                current = parent.get(current);
            }
            paths[node] = path;
        }
    }
    return { distances, paths, unreachable: unreachable.sort() };
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
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            for (const neighbor of neighbors.keys()) {
                if (neighbor === endNode) {
                    return { exists: true };
                }
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return { exists: false };
}
