// Persistent storage for graphs using a temp file

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Graph } from './types';

interface StoredGraph {
  id: string;
  directed: boolean;
  weighted: boolean;
  nodes: string[];
  edges: Array<{ from: string; to: string; weight: number }>;
}

interface Storage {
  graphs: Record<string, StoredGraph>;
  counter: number;
}

const STORAGE_FILE = path.join(os.tmpdir(), 'graphlib-ts-storage.json');

function loadStorage(): Storage {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch {
    // ignore errors
  }
  return { graphs: {}, counter: 0 };
}

function saveStorage(storage: Storage): void {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage), 'utf8');
}

export function getNextId(): string {
  const storage = loadStorage();
  storage.counter++;
  saveStorage(storage);
  return `graph-${storage.counter}`;
}

export function storeGraph(graph: Graph): void {
  const storage = loadStorage();

  const edges: Array<{ from: string; to: string; weight: number }> = [];
  for (const [from, neighbors] of graph.adjacency) {
    for (const [to, weight] of neighbors) {
      edges.push({ from, to, weight });
    }
  }

  storage.graphs[graph.id] = {
    id: graph.id,
    directed: graph.directed,
    weighted: graph.weighted,
    nodes: Array.from(graph.nodes),
    edges,
  };
  saveStorage(storage);
}

export function loadGraph(graphId: string): Graph | undefined {
  const storage = loadStorage();
  const stored = storage.graphs[graphId];
  if (!stored) return undefined;

  const graph: Graph = {
    id: stored.id,
    directed: stored.directed,
    weighted: stored.weighted,
    nodes: new Set(stored.nodes),
    adjacency: new Map(),
    inEdges: new Map(),
  };

  // Initialize adjacency maps for all nodes
  for (const node of stored.nodes) {
    graph.adjacency.set(node, new Map());
    graph.inEdges.set(node, new Map());
  }

  // Add edges
  for (const edge of stored.edges) {
    graph.adjacency.get(edge.from)!.set(edge.to, edge.weight);
    graph.inEdges.get(edge.to)!.set(edge.from, edge.weight);
  }

  return graph;
}

export function deleteGraph(graphId: string): void {
  const storage = loadStorage();
  delete storage.graphs[graphId];
  saveStorage(storage);
}
