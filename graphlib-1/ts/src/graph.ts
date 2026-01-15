import {
  Graph,
  CreateGraphResult,
  AddNodeResult,
  AddEdgeResult,
  RemoveNodeResult,
  RemoveEdgeResult,
  GetNodesResult,
  GetEdgesResult,
  GetNeighborsResult,
  HasNodeResult,
  HasEdgeResult,
  GetDegreeResult,
  GraphInfo,
  ClearGraphResult,
  CloneGraphResult,
  SubgraphResult,
} from './types';
import { loadData, saveData, serializeGraph, deserializeGraph } from './storage';

const graphs = new Map<string, Graph>();
let graphIdCounter = 0;
let initialized = false;

function initializeFromStorage(): void {
  if (initialized) return;
  initialized = true;
  const data = loadData();
  graphIdCounter = data.graphIdCounter;
  for (const serialized of data.graphs) {
    graphs.set(serialized.id, deserializeGraph(serialized));
  }
}

function persistToStorage(): void {
  const data = {
    graphIdCounter,
    graphs: Array.from(graphs.values()).map(serializeGraph),
  };
  saveData(data);
}

function generateId(): string {
  initializeFromStorage();
  return `graph-${++graphIdCounter}`;
}

export function getGraph(graphId: string): Graph | undefined {
  initializeFromStorage();
  return graphs.get(graphId);
}

export function createGraph(options: { directed?: boolean; weighted?: boolean } = {}): CreateGraphResult {
  initializeFromStorage();
  const id = generateId();
  const graph: Graph = {
    id,
    directed: options.directed ?? false,
    weighted: options.weighted ?? false,
    nodes: new Set(),
    adjacency: new Map(),
    reverseAdjacency: new Map(),
  };
  graphs.set(id, graph);
  persistToStorage();
  return {
    id,
    directed: graph.directed,
    weighted: graph.weighted,
    node_count: 0,
    edge_count: 0,
  };
}

export function addNode(graphId: string, nodeId: string): AddNodeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { success: false, error: 'graph_not_found' };
  }
  if (graph.nodes.has(nodeId)) {
    return { success: false, error: 'node_already_exists' };
  }
  graph.nodes.add(nodeId);
  graph.adjacency.set(nodeId, new Map());
  graph.reverseAdjacency.set(nodeId, new Map());
  persistToStorage();
  return { success: true, node_id: nodeId };
}

export function addEdge(graphId: string, fromNode: string, toNode: string, weight?: number): AddEdgeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { success: false, error: 'graph_not_found' };
  }

  // Auto-create nodes
  if (!graph.nodes.has(fromNode)) {
    graph.nodes.add(fromNode);
    graph.adjacency.set(fromNode, new Map());
    graph.reverseAdjacency.set(fromNode, new Map());
  }
  if (!graph.nodes.has(toNode)) {
    graph.nodes.add(toNode);
    graph.adjacency.set(toNode, new Map());
    graph.reverseAdjacency.set(toNode, new Map());
  }

  const edgeWeight = weight ?? 1.0;
  const fromAdj = graph.adjacency.get(fromNode)!;

  // Check for existing edge
  if (fromAdj.has(toNode)) {
    return { success: false, error: 'edge_already_exists' };
  }

  // Add edge
  fromAdj.set(toNode, edgeWeight);
  graph.reverseAdjacency.get(toNode)!.set(fromNode, edgeWeight);

  // For undirected graphs, add reverse edge
  if (!graph.directed) {
    graph.adjacency.get(toNode)!.set(fromNode, edgeWeight);
    graph.reverseAdjacency.get(fromNode)!.set(toNode, edgeWeight);
  }

  persistToStorage();
  return { success: true, from: fromNode, to: toNode, weight: edgeWeight };
}

export function removeNode(graphId: string, nodeId: string): RemoveNodeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { success: false, error: 'graph_not_found' };
  }
  if (!graph.nodes.has(nodeId)) {
    return { success: false, error: 'node_not_found' };
  }

  let removedEdges = 0;

  // Count and remove outgoing edges
  const outgoing = graph.adjacency.get(nodeId);
  if (outgoing) {
    removedEdges += outgoing.size;
    for (const neighbor of outgoing.keys()) {
      graph.reverseAdjacency.get(neighbor)?.delete(nodeId);
    }
  }

  // Count and remove incoming edges
  const incoming = graph.reverseAdjacency.get(nodeId);
  if (incoming) {
    for (const neighbor of incoming.keys()) {
      if (neighbor !== nodeId) {
        graph.adjacency.get(neighbor)?.delete(nodeId);
        if (graph.directed) {
          removedEdges++;
        }
      }
    }
  }

  // Remove the node
  graph.nodes.delete(nodeId);
  graph.adjacency.delete(nodeId);
  graph.reverseAdjacency.delete(nodeId);

  persistToStorage();
  return { success: true, removed_edges: removedEdges };
}

export function removeEdge(graphId: string, fromNode: string, toNode: string): RemoveEdgeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { success: false, error: 'graph_not_found' };
  }

  const fromAdj = graph.adjacency.get(fromNode);
  if (!fromAdj || !fromAdj.has(toNode)) {
    return { success: false, error: 'edge_not_found' };
  }

  fromAdj.delete(toNode);
  graph.reverseAdjacency.get(toNode)?.delete(fromNode);

  // For undirected graphs, remove reverse edge
  if (!graph.directed) {
    graph.adjacency.get(toNode)?.delete(fromNode);
    graph.reverseAdjacency.get(fromNode)?.delete(toNode);
  }

  persistToStorage();
  return { success: true };
}

export function getNodes(graphId: string): GetNodesResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { nodes: [], count: 0 };
  }
  const nodes = Array.from(graph.nodes).sort();
  return { nodes, count: nodes.length };
}

export function getEdges(graphId: string): GetEdgesResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { edges: [], count: 0 };
  }

  const edges: { from: string; to: string; weight: number }[] = [];
  const seen = new Set<string>();

  for (const [from, neighbors] of graph.adjacency) {
    for (const [to, weight] of neighbors) {
      const key = graph.directed ? `${from}->${to}` : [from, to].sort().join('-');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from, to, weight });
      }
    }
  }

  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { edges, count: edges.length };
}

export function getNeighbors(graphId: string, nodeId: string): GetNeighborsResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { neighbors: [], count: 0 };
  }
  const adj = graph.adjacency.get(nodeId);
  if (!adj) {
    return { neighbors: [], count: 0 };
  }
  const neighbors = Array.from(adj.keys()).sort();
  return { neighbors, count: neighbors.length };
}

export function hasNode(graphId: string, nodeId: string): HasNodeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { exists: false };
  }
  return { exists: graph.nodes.has(nodeId) };
}

export function hasEdge(graphId: string, fromNode: string, toNode: string): HasEdgeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { exists: false };
  }
  const adj = graph.adjacency.get(fromNode);
  if (!adj || !adj.has(toNode)) {
    return { exists: false };
  }
  return { exists: true, weight: adj.get(toNode) };
}

export function getDegree(graphId: string, nodeId: string): GetDegreeResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { degree: 0, in_degree: 0, out_degree: 0 };
  }

  const outDegree = graph.adjacency.get(nodeId)?.size ?? 0;
  const inDegree = graph.reverseAdjacency.get(nodeId)?.size ?? 0;

  if (graph.directed) {
    return { degree: inDegree + outDegree, in_degree: inDegree, out_degree: outDegree };
  } else {
    // For undirected, out_degree equals neighbors count
    return { degree: outDegree, in_degree: outDegree, out_degree: outDegree };
  }
}

export function getGraphInfo(graphId: string): GraphInfo {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return {
      id: graphId,
      directed: false,
      weighted: false,
      node_count: 0,
      edge_count: 0,
    };
  }

  // Avoid circular import by computing cycle detection inline
  const edgeCount = getEdges(graphId).count;

  return {
    id: graph.id,
    directed: graph.directed,
    weighted: graph.weighted,
    node_count: graph.nodes.size,
    edge_count: edgeCount,
    is_connected: computeIsConnected(graph),
    has_cycle: computeHasCycle(graph),
  };
}

function computeIsConnected(graph: Graph): boolean {
  if (graph.nodes.size === 0) return true;
  if (graph.nodes.size === 1) return true;

  const visited = new Set<string>();
  const startNode = Array.from(graph.nodes)[0];
  const queue: string[] = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outNeighbors = graph.adjacency.get(current);
    const inNeighbors = graph.reverseAdjacency.get(current);

    const allNeighbors = new Set<string>();
    if (outNeighbors) {
      for (const n of outNeighbors.keys()) allNeighbors.add(n);
    }
    if (inNeighbors) {
      for (const n of inNeighbors.keys()) allNeighbors.add(n);
    }

    for (const neighbor of allNeighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited.size === graph.nodes.size;
}

function computeHasCycle(graph: Graph): boolean {
  if (graph.nodes.size === 0) return false;

  if (graph.directed) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const node of graph.nodes) color.set(node, WHITE);

    function dfs(node: string): boolean {
      color.set(node, GRAY);
      const neighbors = graph.adjacency.get(node);
      if (neighbors) {
        for (const neighbor of neighbors.keys()) {
          if (color.get(neighbor) === GRAY) return true;
          if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
        }
      }
      color.set(node, BLACK);
      return false;
    }

    for (const node of graph.nodes) {
      if (color.get(node) === WHITE && dfs(node)) return true;
    }
    return false;
  } else {
    const visited = new Set<string>();

    function dfs(node: string, parent: string | null): boolean {
      visited.add(node);
      const neighbors = graph.adjacency.get(node);
      if (neighbors) {
        for (const neighbor of neighbors.keys()) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor, node)) return true;
          } else if (neighbor !== parent) {
            return true;
          }
        }
      }
      return false;
    }

    for (const node of graph.nodes) {
      if (!visited.has(node) && dfs(node, null)) return true;
    }
    return false;
  }
}

export function clearGraph(graphId: string): ClearGraphResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { success: false };
  }
  graph.nodes.clear();
  graph.adjacency.clear();
  graph.reverseAdjacency.clear();
  persistToStorage();
  return { success: true };
}

export function cloneGraph(graphId: string): CloneGraphResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { id: '', directed: false, weighted: false, node_count: 0, edge_count: 0 };
  }

  const id = generateId();
  const newGraph: Graph = {
    id,
    directed: graph.directed,
    weighted: graph.weighted,
    nodes: new Set(),
    adjacency: new Map(),
    reverseAdjacency: new Map(),
  };

  // Clone nodes
  for (const node of graph.nodes) {
    newGraph.nodes.add(node);
    newGraph.adjacency.set(node, new Map());
    newGraph.reverseAdjacency.set(node, new Map());
  }

  // Clone edges
  for (const [from, neighbors] of graph.adjacency) {
    for (const [to, weight] of neighbors) {
      newGraph.adjacency.get(from)!.set(to, weight);
      newGraph.reverseAdjacency.get(to)!.set(from, weight);
    }
  }

  graphs.set(id, newGraph);
  persistToStorage();

  return {
    id,
    directed: newGraph.directed,
    weighted: newGraph.weighted,
    node_count: newGraph.nodes.size,
    edge_count: getEdges(id).count,
  };
}

export function subgraph(graphId: string, nodes: string[]): SubgraphResult {
  initializeFromStorage();
  const graph = graphs.get(graphId);
  if (!graph) {
    return { id: '', directed: false, weighted: false, node_count: 0, edge_count: 0 };
  }

  const id = generateId();
  const newGraph: Graph = {
    id,
    directed: graph.directed,
    weighted: graph.weighted,
    nodes: new Set(),
    adjacency: new Map(),
    reverseAdjacency: new Map(),
  };
  const nodeSet = new Set(nodes);

  // Add only specified nodes that exist
  for (const node of nodes) {
    if (graph.nodes.has(node)) {
      newGraph.nodes.add(node);
      newGraph.adjacency.set(node, new Map());
      newGraph.reverseAdjacency.set(node, new Map());
    }
  }

  // Add edges between nodes in the subgraph
  for (const node of newGraph.nodes) {
    const neighbors = graph.adjacency.get(node);
    if (neighbors) {
      for (const [to, weight] of neighbors) {
        if (nodeSet.has(to) && newGraph.nodes.has(to)) {
          newGraph.adjacency.get(node)!.set(to, weight);
          newGraph.reverseAdjacency.get(to)!.set(node, weight);
        }
      }
    }
  }

  graphs.set(id, newGraph);
  persistToStorage();

  return {
    id,
    directed: newGraph.directed,
    weighted: newGraph.weighted,
    node_count: newGraph.nodes.size,
    edge_count: getEdges(id).count,
  };
}
