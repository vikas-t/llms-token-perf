import { ShortestPathResult, AllShortestPathsResult, HasPathResult } from './types';
import { getGraph } from './graph';

class MinHeap {
  private heap: { node: string; distance: number }[] = [];

  push(node: string, distance: number): void {
    this.heap.push({ node, distance });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { node: string; distance: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const result = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return result;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].distance <= this.heap[index].distance) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
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
      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

export function shortestPath(graphId: string, startNode: string, endNode: string): ShortestPathResult {
  const graph = getGraph(graphId);
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
  } else {
    return bfsPath(graph, startNode, endNode);
  }
}

function bfsPath(graph: ReturnType<typeof getGraph>, startNode: string, endNode: string): ShortestPathResult {
  if (!graph) return { exists: false, path: [], distance: -1 };

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: string[] = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === endNode) {
      const path: string[] = [];
      let node: string | undefined = endNode;
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

function dijkstraPath(graph: ReturnType<typeof getGraph>, startNode: string, endNode: string): ShortestPathResult {
  if (!graph) return { exists: false, path: [], distance: -1 };

  const distances = new Map<string, number>();
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const heap = new MinHeap();

  for (const node of graph.nodes) {
    distances.set(node, Infinity);
  }
  distances.set(startNode, 0);
  heap.push(startNode, 0);

  while (!heap.isEmpty()) {
    const { node: current, distance: currentDist } = heap.pop()!;

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === endNode) {
      const path: string[] = [];
      let node: string | undefined = endNode;
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
          if (newDist < distances.get(neighbor)!) {
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

export function allShortestPaths(graphId: string, startNode: string): AllShortestPathsResult {
  const graph = getGraph(graphId);
  if (!graph) {
    return { distances: {}, paths: {}, unreachable: [] };
  }

  if (!graph.nodes.has(startNode)) {
    return { distances: {}, paths: {}, unreachable: Array.from(graph.nodes) };
  }

  const distances: Record<string, number> = {};
  const paths: Record<string, string[]> = {};
  const parent = new Map<string, string>();
  const visited = new Set<string>();

  if (graph.weighted) {
    const heap = new MinHeap();
    const dist = new Map<string, number>();

    for (const node of graph.nodes) {
      dist.set(node, Infinity);
    }
    dist.set(startNode, 0);
    heap.push(startNode, 0);

    while (!heap.isEmpty()) {
      const { node: current, distance: currentDist } = heap.pop()!;

      if (visited.has(current)) continue;
      visited.add(current);
      distances[current] = currentDist;

      const neighbors = graph.adjacency.get(current);
      if (neighbors) {
        for (const [neighbor, weight] of neighbors) {
          if (!visited.has(neighbor)) {
            const newDist = currentDist + weight;
            if (newDist < dist.get(neighbor)!) {
              dist.set(neighbor, newDist);
              parent.set(neighbor, current);
              heap.push(neighbor, newDist);
            }
          }
        }
      }
    }
  } else {
    const queue: string[] = [startNode];
    const dist = new Map<string, number>();
    dist.set(startNode, 0);
    visited.add(startNode);
    distances[startNode] = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;

      const neighbors = graph.adjacency.get(current);
      if (neighbors) {
        const sortedNeighbors = Array.from(neighbors.keys()).sort();
        for (const neighbor of sortedNeighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            const newDist = dist.get(current)! + 1;
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
    const path: string[] = [];
    let current: string | undefined = node;
    while (current !== undefined) {
      path.unshift(current);
      current = parent.get(current);
    }
    paths[node] = path;
  }

  // Find unreachable nodes
  const unreachable: string[] = [];
  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      unreachable.push(node);
    }
  }
  unreachable.sort();

  return { distances, paths, unreachable };
}

export function hasPath(graphId: string, startNode: string, endNode: string): HasPathResult {
  const graph = getGraph(graphId);
  if (!graph) {
    return { exists: false };
  }

  if (!graph.nodes.has(startNode) || !graph.nodes.has(endNode)) {
    return { exists: false };
  }

  if (startNode === endNode) {
    return { exists: true };
  }

  const visited = new Set<string>();
  const queue: string[] = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;

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
