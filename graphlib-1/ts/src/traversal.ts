import { BFSResult, DFSResult } from './types';
import { getGraph } from './graph';

export function bfs(graphId: string, startNode: string): BFSResult {
  const graph = getGraph(graphId);
  if (!graph || !graph.nodes.has(startNode)) {
    return { order: [], levels: {}, parent: {} };
  }

  const order: string[] = [];
  const levels: Record<string, number> = {};
  const parent: Record<string, string> = {};
  const visited = new Set<string>();

  const queue: string[] = [startNode];
  visited.add(startNode);
  levels[startNode] = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
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

export function dfs(graphId: string, startNode: string): DFSResult {
  const graph = getGraph(graphId);
  if (!graph || !graph.nodes.has(startNode)) {
    return { order: [], discovery: {}, finish: {}, parent: {} };
  }

  const order: string[] = [];
  const discovery: Record<string, number> = {};
  const finish: Record<string, number> = {};
  const parent: Record<string, string> = {};
  const visited = new Set<string>();
  let time = 0;

  function dfsVisit(node: string): void {
    visited.add(node);
    discovery[node] = time++;
    order.push(node);

    const neighbors = graph!.adjacency.get(node);
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
