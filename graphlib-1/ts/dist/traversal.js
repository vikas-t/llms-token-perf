"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bfs = bfs;
exports.dfs = dfs;
const graph_1 = require("./graph");
function bfs(graphId, startNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || !graph.nodes.has(startNode)) {
        return { order: [], levels: {}, parent: {} };
    }
    const order = [];
    const levels = {};
    const parent = {};
    const visited = new Set();
    const queue = [startNode];
    visited.add(startNode);
    levels[startNode] = 0;
    while (queue.length > 0) {
        const current = queue.shift();
        order.push(current);
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                    levels[neighbor] = levels[current] + 1;
                    parent[neighbor] = current;
                }
            }
        }
    }
    return { order, levels, parent };
}
function dfs(graphId, startNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || !graph.nodes.has(startNode)) {
        return { order: [], discovery: {}, finish: {}, parent: {} };
    }
    const order = [];
    const discovery = {};
    const finish = {};
    const parent = {};
    const visited = new Set();
    let time = 0;
    function dfsVisit(node) {
        visited.add(node);
        discovery[node] = time++;
        order.push(node);
        const neighbors = graph.adjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    parent[neighbor] = node;
                    dfsVisit(neighbor);
                }
            }
        }
        finish[node] = time++;
    }
    dfsVisit(startNode);
    return { order, discovery, finish, parent };
}
