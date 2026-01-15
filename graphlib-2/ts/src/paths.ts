// Pathfinding algorithms: shortest_path, all_shortest_paths, has_path

import { ShortestPathResult, AllShortestPathsResult, HasPathResult } from './types';
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

  // Same node
  if (startNode === endNode) {
    return { exists: true, path: [startNode], distance: 0 };
  }

  // Use BFS for unweighted, Dijkstra for weighted
  if (!graph.weighted) {
    return bfsShortestPath(graph, startNode, endNode);
  } else {
    return dijkstraShortestPath(graph, startNode, endNode);
  }
}

function bfsShortestPath(
  graph: ReturnType<typeof getGraph>,
  startNode: string,
  endNode: string
): ShortestPathResult {
  if (!graph) return { exists: false, path: [], distance: -1 };

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: string[] = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === endNode) {
      // Reconstruct path
      const path: string[] = [];
      let node: string | undefined = endNode;
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

function dijkstraShortestPath(
  graph: ReturnType<typeof getGraph>,
  startNode: string,
  endNode: string
): ShortestPathResult {
  if (!graph) return { exists: false, path: [], distance: -1 };

  const dist = new Map<string, number>();
  const parent = new Map<string, string>();
  const visited = new Set<string>();

  // Initialize distances
  for (const node of graph.nodes) {
    dist.set(node, Infinity);
  }
  dist.set(startNode, 0);

  // Priority queue simulation (simple array-based)
  const pq: Array<{ node: string; dist: number }> = [{ node: startNode, dist: 0 }];

  while (pq.length > 0) {
    // Find min distance node
    pq.sort((a, b) => a.dist - b.dist);
    const { node: current, dist: currentDist } = pq.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === endNode) {
      // Reconstruct path
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
          if (newDist < dist.get(neighbor)!) {
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
  const unreachable: string[] = [];
  const parent = new Map<string, string>();

  if (!graph.weighted) {
    // BFS for unweighted
    const visited = new Set<string>();
    const queue: string[] = [startNode];
    visited.add(startNode);
    distances[startNode] = 0;
    paths[startNode] = [startNode];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = Array.from(graph.adjacency.get(current)?.keys() ?? []).sort();

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
          parent.set(neighbor, current);
          distances[neighbor] = distances[current] + 1;

          // Reconstruct path
          const path: string[] = [];
          let node: string | undefined = neighbor;
          while (node !== undefined) {
            path.unshift(node);
            node = parent.get(node);
          }
          paths[neighbor] = path;
        }
      }
    }
  } else {
    // Dijkstra for weighted
    const dist = new Map<string, number>();
    const visited = new Set<string>();

    for (const node of graph.nodes) {
      dist.set(node, Infinity);
    }
    dist.set(startNode, 0);
    distances[startNode] = 0;
    paths[startNode] = [startNode];

    const pq: Array<{ node: string; dist: number }> = [{ node: startNode, dist: 0 }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.dist - b.dist);
      const { node: current, dist: currentDist } = pq.shift()!;

      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = graph.adjacency.get(current);
      if (neighbors) {
        for (const [neighbor, weight] of neighbors) {
          if (!visited.has(neighbor)) {
            const newDist = currentDist + weight;
            if (newDist < dist.get(neighbor)!) {
              dist.set(neighbor, newDist);
              parent.set(neighbor, current);
              distances[neighbor] = newDist;

              // Reconstruct path
              const path: string[] = [];
              let node: string | undefined = neighbor;
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
