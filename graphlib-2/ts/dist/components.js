"use strict";
// Cycle detection, topological sort, connected components, strongly connected components
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasCycle = hasCycle;
exports.isDAG = isDAG;
exports.topologicalSort = topologicalSort;
exports.connectedComponents = connectedComponents;
exports.stronglyConnectedComponents = stronglyConnectedComponents;
exports.isConnected = isConnected;
const graph_1 = require("./graph");
function hasCycle(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || graph.nodes.size === 0) {
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
    const WHITE = 0; // unvisited
    const GRAY = 1; // in progress
    const BLACK = 2; // finished
    const color = new Map();
    const parent = new Map();
    for (const node of graph.nodes) {
        color.set(node, WHITE);
    }
    function dfs(node) {
        color.set(node, GRAY);
        const neighbors = Array.from(graph.adjacency.get(node)?.keys() ?? []).sort();
        for (const neighbor of neighbors) {
            if (color.get(neighbor) === GRAY) {
                // Found back edge - cycle detected
                const cycle = [neighbor];
                let current = node;
                while (current !== neighbor) {
                    cycle.unshift(current);
                    current = parent.get(current) ?? neighbor;
                }
                cycle.unshift(neighbor);
                return cycle;
            }
            if (color.get(neighbor) === WHITE) {
                parent.set(neighbor, node);
                const result = dfs(neighbor);
                if (result)
                    return result;
            }
        }
        color.set(node, BLACK);
        return null;
    }
    for (const node of Array.from(graph.nodes).sort()) {
        if (color.get(node) === WHITE) {
            const cycle = dfs(node);
            if (cycle) {
                return { has_cycle: true, cycle };
            }
        }
    }
    return { has_cycle: false, cycle: [] };
}
function hasCycleUndirected(graph) {
    const visited = new Set();
    const parent = new Map();
    function dfs(node, parentNode) {
        visited.add(node);
        parent.set(node, parentNode);
        const neighbors = Array.from(graph.adjacency.get(node)?.keys() ?? []).sort();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                const result = dfs(neighbor, node);
                if (result)
                    return result;
            }
            else if (neighbor !== parentNode) {
                // Found cycle - reconstruct it
                const cycle = [neighbor];
                let current = node;
                while (current !== neighbor) {
                    cycle.unshift(current);
                    current = parent.get(current) ?? neighbor;
                }
                cycle.unshift(neighbor);
                return cycle;
            }
        }
        return null;
    }
    for (const node of Array.from(graph.nodes).sort()) {
        if (!visited.has(node)) {
            const cycle = dfs(node, null);
            if (cycle) {
                return { has_cycle: true, cycle };
            }
        }
    }
    return { has_cycle: false, cycle: [] };
}
function isDAG(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { is_dag: false };
    }
    // DAG is only defined for directed graphs
    if (!graph.directed) {
        return { is_dag: false };
    }
    // Empty directed graph is a DAG
    if (graph.nodes.size === 0) {
        return { is_dag: true };
    }
    const cycleResult = hasCycle(graphId);
    return { is_dag: !cycleResult.has_cycle };
}
function topologicalSort(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { success: false, error: 'graph_not_found' };
    }
    // Only works for directed acyclic graphs
    if (!graph.directed) {
        return { success: false, error: 'not_a_dag' };
    }
    // Check for cycles
    const cycleResult = hasCycle(graphId);
    if (cycleResult.has_cycle) {
        return { success: false, error: 'not_a_dag' };
    }
    // Kahn's algorithm
    const inDegree = new Map();
    for (const node of graph.nodes) {
        inDegree.set(node, 0);
    }
    for (const [, neighbors] of graph.adjacency) {
        for (const neighbor of neighbors.keys()) {
            inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
        }
    }
    const queue = [];
    for (const [node, degree] of inDegree) {
        if (degree === 0) {
            queue.push(node);
        }
    }
    queue.sort();
    const order = [];
    while (queue.length > 0) {
        queue.sort(); // Ensure deterministic ordering
        const current = queue.shift();
        order.push(current);
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
            for (const neighbor of neighbors.keys()) {
                const newDegree = inDegree.get(neighbor) - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    queue.push(neighbor);
                }
            }
        }
    }
    return { success: true, order };
}
function connectedComponents(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || graph.nodes.size === 0) {
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
            // For connectivity, we need to traverse both directions for directed graphs
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
        return component.sort();
    }
    for (const node of Array.from(graph.nodes).sort()) {
        if (!visited.has(node)) {
            const component = bfs(node);
            components.push(component);
        }
    }
    return { count: components.length, components };
}
function stronglyConnectedComponents(graphId) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph || graph.nodes.size === 0) {
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
        const neighbors = Array.from(graph.adjacency.get(node)?.keys() ?? []).sort();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs1(neighbor);
            }
        }
        finishOrder.push(node);
    }
    for (const node of Array.from(graph.nodes).sort()) {
        if (!visited.has(node)) {
            dfs1(node);
        }
    }
    // Build transpose graph edges (use inEdges)
    visited.clear();
    const components = [];
    // Second DFS on transpose in reverse finish order
    function dfs2(node, component) {
        visited.add(node);
        component.push(node);
        const neighbors = Array.from(graph.inEdges.get(node)?.keys() ?? []).sort();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs2(neighbor, component);
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
    // For directed graphs, check weak connectivity
    const ccResult = connectedComponents(graphId);
    return { is_connected: ccResult.count === 1 };
}
