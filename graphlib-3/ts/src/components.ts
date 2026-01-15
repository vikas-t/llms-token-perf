import {
  HasCycleResult,
  IsDAGResult,
  TopologicalSortResult,
  ConnectedComponentsResult,
  IsConnectedResult,
} from './types';
import { getGraph } from './graph';

export function hasCycle(graphId: string): HasCycleResult {
  const graph = getGraph(graphId);
  if (!graph || graph.nodes.size === 0) {
    return { has_cycle: false, cycle: [] };
  }

  if (graph.directed) {
    return hasCycleDirected(graphId);
  } else {
    return hasCycleUndirected(graphId);
  }
}

function hasCycleDirected(graphId: string): HasCycleResult {
  const graph = getGraph(graphId)!;
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const node of graph.nodes) {
    color.set(node, WHITE);
  }

  let cycleStart: string | null = null;
  let cycleEnd: string | null = null;

  function dfs(node: string): boolean {
    color.set(node, GRAY);

    const neighbors = graph!.adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        if (color.get(neighbor) === GRAY) {
          // Back edge found - cycle detected
          cycleStart = neighbor;
          cycleEnd = node;
          return true;
        }
        if (color.get(neighbor) === WHITE) {
          parent.set(neighbor, node);
          if (dfs(neighbor)) {
            return true;
          }
        }
      }
    }

    color.set(node, BLACK);
    return false;
  }

  for (const node of graph.nodes) {
    if (color.get(node) === WHITE) {
      if (dfs(node)) {
        // Reconstruct cycle
        const cycle: string[] = [cycleStart!];
        let current = cycleEnd!;
        while (current !== cycleStart) {
          cycle.push(current);
          current = parent.get(current)!;
        }
        cycle.push(cycleStart!);
        cycle.reverse();
        return { has_cycle: true, cycle };
      }
    }
  }

  return { has_cycle: false, cycle: [] };
}

function hasCycleUndirected(graphId: string): HasCycleResult {
  const graph = getGraph(graphId)!;
  const visited = new Set<string>();
  const parent = new Map<string, string>();

  let cycleStart: string | null = null;
  let cycleEnd: string | null = null;

  function dfs(node: string, par: string | null): boolean {
    visited.add(node);

    const neighbors = graph!.adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        if (!visited.has(neighbor)) {
          parent.set(neighbor, node);
          if (dfs(neighbor, node)) {
            return true;
          }
        } else if (neighbor !== par) {
          // Back edge found
          cycleStart = neighbor;
          cycleEnd = node;
          return true;
        }
      }
    }

    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      if (dfs(node, null)) {
        // Reconstruct cycle
        const cycle: string[] = [cycleStart!];
        let current = cycleEnd!;
        while (current !== cycleStart) {
          cycle.push(current);
          current = parent.get(current)!;
        }
        cycle.push(cycleStart!);
        return { has_cycle: true, cycle };
      }
    }
  }

  return { has_cycle: false, cycle: [] };
}

export function isDAG(graphId: string): IsDAGResult {
  const graph = getGraph(graphId);
  if (!graph) {
    return { is_dag: false };
  }

  // DAG only applies to directed graphs
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

export function topologicalSort(graphId: string): TopologicalSortResult {
  const graph = getGraph(graphId);
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

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }

  for (const [, neighbors] of graph.adjacency) {
    for (const neighbor of neighbors.keys()) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
    }
  }

  // Use sorted order for deterministic output
  const queue: string[] = [];
  for (const node of Array.from(graph.nodes).sort()) {
    if (inDegree.get(node) === 0) {
      queue.push(node);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    queue.sort();
    const current = queue.shift()!;
    order.push(current);

    const neighbors = graph.adjacency.get(current);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  return { success: true, order };
}

export function connectedComponents(graphId: string): ConnectedComponentsResult {
  const graph = getGraph(graphId);
  if (!graph || graph.nodes.size === 0) {
    return { count: 0, components: [] };
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  // For directed graphs, use weak connectivity (ignore direction)
  function getNeighbors(node: string): string[] {
    const neighbors = new Set<string>();
    const outNeighbors = graph!.adjacency.get(node);
    if (outNeighbors) {
      for (const n of outNeighbors.keys()) {
        neighbors.add(n);
      }
    }
    const inNeighbors = graph!.inEdges.get(node);
    if (inNeighbors) {
      for (const n of inNeighbors.keys()) {
        neighbors.add(n);
      }
    }
    return Array.from(neighbors);
  }

  for (const startNode of Array.from(graph.nodes).sort()) {
    if (!visited.has(startNode)) {
      const component: string[] = [];
      const queue: string[] = [startNode];
      visited.add(startNode);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        for (const neighbor of getNeighbors(current)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      components.push(component.sort());
    }
  }

  return { count: components.length, components };
}

export function stronglyConnectedComponents(
  graphId: string
): ConnectedComponentsResult {
  const graph = getGraph(graphId);
  if (!graph || graph.nodes.size === 0) {
    return { count: 0, components: [] };
  }

  // For undirected graphs, SCC equals CC
  if (!graph.directed) {
    return connectedComponents(graphId);
  }

  // Kosaraju's algorithm
  const visited = new Set<string>();
  const finishOrder: string[] = [];

  // First DFS to get finish order
  function dfs1(node: string): void {
    visited.add(node);
    const neighbors = graph!.adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        if (!visited.has(neighbor)) {
          dfs1(neighbor);
        }
      }
    }
    finishOrder.push(node);
  }

  for (const node of Array.from(graph.nodes).sort()) {
    if (!visited.has(node)) {
      dfs1(node);
    }
  }

  // Second DFS on transposed graph
  visited.clear();
  const components: string[][] = [];

  function dfs2(node: string, component: string[]): void {
    visited.add(node);
    component.push(node);
    // Use inEdges for transposed graph
    const neighbors = graph!.inEdges.get(node);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        if (!visited.has(neighbor)) {
          dfs2(neighbor, component);
        }
      }
    }
  }

  // Process in reverse finish order
  for (let i = finishOrder.length - 1; i >= 0; i--) {
    const node = finishOrder[i];
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs2(node, component);
      components.push(component.sort());
    }
  }

  return { count: components.length, components };
}

export function isConnected(graphId: string): IsConnectedResult {
  const graph = getGraph(graphId);
  if (!graph) {
    return { is_connected: true };
  }

  if (graph.nodes.size <= 1) {
    return { is_connected: true };
  }

  const cc = connectedComponents(graphId);
  return { is_connected: cc.count === 1 };
}
