import {
  ShortestPathResult,
  AllShortestPathsResult,
  HasPathResult,
} from './types';
import { getGraph } from './graph';

export function shortestPath(
  graphId: string,
  startNode: string,
  endNode: string
): ShortestPathResult {
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

  // Use Dijkstra for weighted, BFS for unweighted
  if (graph.weighted) {
    return dijkstra(graphId, startNode, endNode);
  } else {
    return bfsPath(graphId, startNode, endNode);
  }
}

function bfsPath(
  graphId: string,
  startNode: string,
  endNode: string
): ShortestPathResult {
  const graph = getGraph(graphId)!;
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === endNode) {
      // Reconstruct path
      const path: string[] = [];
      let node: string | undefined = endNode;
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

function dijkstra(
  graphId: string,
  startNode: string,
  endNode: string
): ShortestPathResult {
  const graph = getGraph(graphId)!;
  const distances = new Map<string, number>();
  const parent = new Map<string, string>();
  const visited = new Set<string>();

  for (const node of graph.nodes) {
    distances.set(node, Infinity);
  }
  distances.set(startNode, 0);

  // Simple priority queue using array (adequate for correctness)
  const pq: Array<[number, string]> = [[0, startNode]];

  while (pq.length > 0) {
    // Find minimum
    pq.sort((a, b) => a[0] - b[0]);
    const [dist, current] = pq.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === endNode) {
      const path: string[] = [];
      let node: string | undefined = endNode;
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
          if (newDist < distances.get(neighbor)!) {
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

export function allShortestPaths(
  graphId: string,
  startNode: string
): AllShortestPathsResult {
  const graph = getGraph(graphId);
  if (!graph || !graph.nodes.has(startNode)) {
    return { distances: {}, paths: {}, unreachable: [] };
  }

  const distances: Record<string, number> = {};
  const paths: Record<string, string[]> = {};
  const parent = new Map<string, string>();
  const distMap = new Map<string, number>();
  const visited = new Set<string>();

  for (const node of graph.nodes) {
    distMap.set(node, Infinity);
  }
  distMap.set(startNode, 0);

  if (graph.weighted) {
    // Dijkstra
    const pq: Array<[number, string]> = [[0, startNode]];

    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0]);
      const [dist, current] = pq.shift()!;

      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = graph.adjacency.get(current);
      if (neighbors) {
        for (const [neighbor, weight] of neighbors) {
          if (!visited.has(neighbor)) {
            const newDist = dist + weight;
            if (newDist < distMap.get(neighbor)!) {
              distMap.set(neighbor, newDist);
              parent.set(neighbor, current);
              pq.push([newDist, neighbor]);
            }
          }
        }
      }
    }
  } else {
    // BFS
    const queue: string[] = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distMap.get(current)!;

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

  const unreachable: string[] = [];

  for (const node of graph.nodes) {
    const dist = distMap.get(node)!;
    if (dist === Infinity) {
      unreachable.push(node);
    } else {
      distances[node] = dist;
      // Reconstruct path
      const path: string[] = [];
      let current: string | undefined = node;
      while (current) {
        path.unshift(current);
        current = parent.get(current);
      }
      paths[node] = path;
    }
  }

  return { distances, paths, unreachable: unreachable.sort() };
}

export function hasPath(
  graphId: string,
  startNode: string,
  endNode: string
): HasPathResult {
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

  // BFS to check reachability
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
