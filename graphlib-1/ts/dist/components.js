"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasCycle = hasCycle;
exports.isDag = isDag;
exports.topologicalSort = topologicalSort;
exports.connectedComponents = connectedComponents;
exports.stronglyConnectedComponents = stronglyConnectedComponents;
exports.isConnected = isConnected;
const graph_1 = require("./graph");
function hasCycle(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { has_cycle: false, cycle: [] };
    }
    if (graph.nodes.size === 0) {
        return { has_cycle: false, cycle: [] };
    }
    if (graph.directed) {
        return hasCycleDirected(graph);
    }
    else {
        return hasCycleUndirected(graph);
    }
}
function hasCycleDirected(graph) {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map();
    const parent = new Map();
    for (const node of graph.nodes) {
        color.set(node, WHITE);
    }
    let cycleFound = false;
    let cycleEnd = '';
    let cycleStart = '';
    function dfs(node) {
        color.set(node, GRAY);
        const neighbors = graph.adjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (color.get(neighbor) === GRAY) {
                    cycleFound = true;
                    cycleEnd = node;
                    cycleStart = neighbor;
                    return true;
                }
                if (color.get(neighbor) === WHITE) {
                    parent.set(neighbor, node);
                    if (dfs(neighbor))
                        return true;
                }
            }
        }
        color.set(node, BLACK);
        return false;
    }
    const sortedNodes = Array.from(graph.nodes).sort();
    for (const node of sortedNodes) {
        if (color.get(node) === WHITE) {
            if (dfs(node))
                break;
        }
    }
    if (!cycleFound) {
        return { has_cycle: false, cycle: [] };
    }
    // Reconstruct cycle
    const cycle = [cycleStart];
    let current = cycleEnd;
    while (current !== cycleStart) {
        cycle.unshift(current);
        current = parent.get(current);
    }
    cycle.unshift(cycleStart);
    return { has_cycle: true, cycle };
}
function hasCycleUndirected(graph) {
    const visited = new Set();
    const parent = new Map();
    let cycleFound = false;
    let cycleEnd = '';
    let cycleStart = '';
    function dfs(node, par) {
        visited.add(node);
        const neighbors = graph.adjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    parent.set(neighbor, node);
                    if (dfs(neighbor, node))
                        return true;
                }
                else if (neighbor !== par) {
                    cycleFound = true;
                    cycleEnd = node;
                    cycleStart = neighbor;
                    return true;
                }
            }
        }
        return false;
    }
    const sortedNodes = Array.from(graph.nodes).sort();
    for (const node of sortedNodes) {
        if (!visited.has(node)) {
            if (dfs(node, null))
                break;
        }
    }
    if (!cycleFound) {
        return { has_cycle: false, cycle: [] };
    }
    // Reconstruct cycle
    const cycle = [cycleStart];
    let current = cycleEnd;
    while (current !== cycleStart) {
        cycle.unshift(current);
        current = parent.get(current);
    }
    cycle.unshift(cycleStart);
    return { has_cycle: true, cycle };
}
function isDag(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { is_dag: false };
    }
    if (!graph.directed) {
        return { is_dag: false };
    }
    const cycleResult = hasCycle(graphId);
    return { is_dag: !cycleResult.has_cycle };
}
function topologicalSort(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    if (!graph.directed) {
        return { success: false, error: 'not_a_dag' };
    }
    const cycleResult = hasCycle(graphId);
    if (cycleResult.has_cycle) {
        return { success: false, error: 'not_a_dag' };
    }
    const visited = new Set();
    const result = [];
    function dfs(node) {
        visited.add(node);
        const neighbors = graph.adjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor);
                }
            }
        }
        result.unshift(node);
    }
    const sortedNodes = Array.from(graph.nodes).sort();
    for (const node of sortedNodes) {
        if (!visited.has(node)) {
            dfs(node);
        }
    }
    return { success: true, order: result };
}
function connectedComponents(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { count: 0, components: [] };
    }
    if (graph.nodes.size === 0) {
        return { count: 0, components: [] };
    }
    const visited = new Set();
    const components = [];
    function bfs(startNode) {
        const component = [];
        const queue = [startNode];
        visited.add(startNode);
        while (queue.length > 0) {
            const current = queue.shift();
            component.push(current);
            // For weak connectivity in directed graphs, consider both directions
            const outNeighbors = graph.adjacency.get(current);
            const inNeighbors = graph.reverseAdjacency.get(current);
            const allNeighbors = new Set();
            if (outNeighbors) {
                for (const n of outNeighbors.keys())
                    allNeighbors.add(n);
            }
            if (inNeighbors) {
                for (const n of inNeighbors.keys())
                    allNeighbors.add(n);
            }
            const sortedNeighbors = Array.from(allNeighbors).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        return component.sort();
    }
    const sortedNodes = Array.from(graph.nodes).sort();
    for (const node of sortedNodes) {
        if (!visited.has(node)) {
            components.push(bfs(node));
        }
    }
    return { count: components.length, components };
}
function stronglyConnectedComponents(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { count: 0, components: [] };
    }
    if (graph.nodes.size === 0) {
        return { count: 0, components: [] };
    }
    // For undirected graphs, SCC is same as CC
    if (!graph.directed) {
        return connectedComponents(graphId);
    }
    // Kosaraju's algorithm
    const visited = new Set();
    const finishOrder = [];
    // First DFS to get finish order
    function dfs1(node) {
        visited.add(node);
        const neighbors = graph.adjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    dfs1(neighbor);
                }
            }
        }
        finishOrder.push(node);
    }
    const sortedNodes = Array.from(graph.nodes).sort();
    for (const node of sortedNodes) {
        if (!visited.has(node)) {
            dfs1(node);
        }
    }
    // Second DFS on reversed graph in reverse finish order
    visited.clear();
    const components = [];
    function dfs2(node, component) {
        visited.add(node);
        component.push(node);
        const neighbors = graph.reverseAdjacency.get(node);
        if (neighbors) {
            const sortedNeighbors = Array.from(neighbors.keys()).sort();
            for (const neighbor of sortedNeighbors) {
                if (!visited.has(neighbor)) {
                    dfs2(neighbor, component);
                }
            }
        }
    }
    for (let i = finishOrder.length - 1; i >= 0; i--) {
        const node = finishOrder[i];
        if (!visited.has(node)) {
            const component = [];
            dfs2(node, component);
            components.push(component.sort());
        }
    }
    return { count: components.length, components };
}
function isConnected(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { is_connected: true };
    }
    if (graph.nodes.size === 0) {
        return { is_connected: true };
    }
    if (graph.nodes.size === 1) {
        return { is_connected: true };
    }
    // Use BFS considering both directions (weak connectivity for directed graphs)
    const visited = new Set();
    const startNode = Array.from(graph.nodes)[0];
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        const current = queue.shift();
        const outNeighbors = graph.adjacency.get(current);
        const inNeighbors = graph.reverseAdjacency.get(current);
        const allNeighbors = new Set();
        if (outNeighbors) {
            for (const n of outNeighbors.keys())
                allNeighbors.add(n);
        }
        if (inNeighbors) {
            for (const n of inNeighbors.keys())
                allNeighbors.add(n);
        }
        for (const neighbor of allNeighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return { is_connected: visited.size === graph.nodes.size };
}
