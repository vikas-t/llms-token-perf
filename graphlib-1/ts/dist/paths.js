"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortestPath = shortestPath;
exports.allShortestPaths = allShortestPaths;
exports.hasPath = hasPath;
const graph_1 = require("./graph");
class MinHeap {
    constructor() {
        this.heap = [];
    }
    push(node, distance) {
        this.heap.push({ node, distance });
        this.bubbleUp(this.heap.length - 1);
    }
    pop() {
        if (this.heap.length === 0)
            return undefined;
        const result = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.bubbleDown(0);
        }
        return result;
    }
    isEmpty() {
        return this.heap.length === 0;
    }
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].distance <= this.heap[index].distance)
                break;
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }
    bubbleDown(index) {
        const length = this.heap.length;
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;
            if (leftChild < length && this.heap[leftChild].distance < this.heap[smallest].distance) {
                smallest = leftChild;
            }
            if (rightChild < length && this.heap[rightChild].distance < this.heap[smallest].distance) {
                smallest = rightChild;
            }
            if (smallest === index)
                break;
            [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
            index = smallest;
        }
    }
}
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
    if (graph.weighted) {
        return dijkstraPath(graph, startNode, endNode);
    }
    else {
        return bfsPath(graph, startNode, endNode);
    }
}
function bfsPath(graph, startNode, endNode) {
    if (!graph)
        return { exists: false, path: [], distance: -1 };
    const visited = new Set();
    const parent = new Map();
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === endNode) {
            const path = [];
            let node = endNode;
            while (node !== undefined) {
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
function dijkstraPath(graph, startNode, endNode) {
    if (!graph)
        return { exists: false, path: [], distance: -1 };
    const distances = new Map();
    const parent = new Map();
    const visited = new Set();
    const heap = new MinHeap();
    for (const node of graph.nodes) {
        distances.set(node, Infinity);
    }
    distances.set(startNode, 0);
    heap.push(startNode, 0);
    while (!heap.isEmpty()) {
        const { node: current, distance: currentDist } = heap.pop();
        if (visited.has(current))
            continue;
        visited.add(current);
        if (current === endNode) {
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
                    if (newDist < distances.get(neighbor)) {
                        distances.set(neighbor, newDist);
                        parent.set(neighbor, current);
                        heap.push(neighbor, newDist);
                    }
                }
            }
        }
    }
    return { exists: false, path: [], distance: -1 };
}
function allShortestPaths(graphId, startNode) {
    const graph = (0, graph_1.getGraph)(graphId);
    if (!graph) {
        return { distances: {}, paths: {}, unreachable: [] };
    }
    if (!graph.nodes.has(startNode)) {
        return { distances: {}, paths: {}, unreachable: Array.from(graph.nodes) };
    }
    const distances = {};
    const paths = {};
    const parent = new Map();
    const visited = new Set();
    if (graph.weighted) {
        const heap = new MinHeap();
        const dist = new Map();
        for (const node of graph.nodes) {
            dist.set(node, Infinity);
        }
        dist.set(startNode, 0);
        heap.push(startNode, 0);
        while (!heap.isEmpty()) {
            const { node: current, distance: currentDist } = heap.pop();
            if (visited.has(current))
                continue;
            visited.add(current);
            distances[current] = currentDist;
            const neighbors = graph.adjacency.get(current);
            if (neighbors) {
                for (const [neighbor, weight] of neighbors) {
                    if (!visited.has(neighbor)) {
                        const newDist = currentDist + weight;
                        if (newDist < dist.get(neighbor)) {
                            dist.set(neighbor, newDist);
                            parent.set(neighbor, current);
                            heap.push(neighbor, newDist);
                        }
                    }
                }
            }
        }
    }
    else {
        const queue = [startNode];
        const dist = new Map();
        dist.set(startNode, 0);
        visited.add(startNode);
        distances[startNode] = 0;
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = graph.adjacency.get(current);
            if (neighbors) {
                const sortedNeighbors = Array.from(neighbors.keys()).sort();
                for (const neighbor of sortedNeighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        const newDist = dist.get(current) + 1;
                        dist.set(neighbor, newDist);
                        distances[neighbor] = newDist;
                        parent.set(neighbor, current);
                        queue.push(neighbor);
                    }
                }
            }
        }
    }
    // Build paths
    for (const node of visited) {
        const path = [];
        let current = node;
        while (current !== undefined) {
            path.unshift(current);
            current = parent.get(current);
        }
        paths[node] = path;
    }
    // Find unreachable nodes
    const unreachable = [];
    for (const node of graph.nodes) {
        if (!visited.has(node)) {
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
