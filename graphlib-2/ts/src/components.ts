// Cycle detection, topological sort, connected components, strongly connected components

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
    return hasCycleDirected(graph);
  } else {
    return hasCycleUndirected(graph);
  }
}

function hasCycleDirected(
  graph: NonNullable<ReturnType<typeof getGraph>>
): HasCycleResult {
  const WHITE = 0; // unvisited
  const GRAY = 1; // in progress
  const BLACK = 2; // finished

  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const node of graph.nodes) {
    color.set(node, WHITE);
  }

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);

    const neighbors = Array.from(graph.adjacency.get(node)?.keys() ?? []).sort();
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === GRAY) {
        // Found back edge - cycle detected
        const cycle: string[] = [neighbor];
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
        if (result) return result;
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

function hasCycleUndirected(
  graph: NonNullable<ReturnType<typeof getGraph>>
): HasCycleResult {
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  function dfs(node: string, parentNode: string | null): string[] | null {
    visited.add(node);
    parent.set(node, parentNode);

    const neighbors = Array.from(graph.adjacency.get(node)?.keys() ?? []).sort();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const result = dfs(neighbor, node);
        if (result) return result;
      } else if (neighbor !== parentNode) {
        // Found cycle - reconstruct it
        const cycle: string[] = [neighbor];
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

export function isDAG(graphId: string): IsDAGResult {
  const graph = getGraph(graphId);
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

export function topologicalSort(graphId: string): TopologicalSortResult {
  const graph = getGraph(graphId);
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
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }

  for (const [, neighbors] of graph.adjacency) {
    for (const neighbor of neighbors.keys()) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  queue.sort();

  const order: string[] = [];

  while (queue.length > 0) {
    queue.sort(); // Ensure deterministic ordering
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

  function bfs(startNode: string): string[] {
    const component: string[] = [];
    const queue: string[] = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      // For connectivity, we need to traverse both directions for directed graphs
      const outNeighbors = graph!.adjacency.get(current) ?? new Map();
      const inNeighbors = graph!.inEdges.get(current) ?? new Map();

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

export function stronglyConnectedComponents(
  graphId: string
): ConnectedComponentsResult {
  const graph = getGraph(graphId);
  if (!graph || graph.nodes.size === 0) {
    return { count: 0, components: [] };
  }

  // For undirected graphs, SCC is same as CC
  if (!graph.directed) {
    return connectedComponents(graphId);
  }

  // Kosaraju's algorithm
  const visited = new Set<string>();
  const finishOrder: string[] = [];

  // First DFS to get finish order
  function dfs1(node: string): void {
    visited.add(node);
    const neighbors = Array.from(graph!.adjacency.get(node)?.keys() ?? []).sort();
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
  const components: string[][] = [];

  // Second DFS on transpose in reverse finish order
  function dfs2(node: string, component: string[]): void {
    visited.add(node);
    component.push(node);
    const neighbors = Array.from(graph!.inEdges.get(node)?.keys() ?? []).sort();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs2(neighbor, component);
      }
    }
  }

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
