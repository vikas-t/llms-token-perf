import * as fs from 'fs';
import * as path from 'path';

const STORAGE_FILE = path.join(__dirname, '..', 'data', 'graphs.json');

interface SerializedGraph {
  id: string;
  directed: boolean;
  weighted: boolean;
  nodes: string[];
  edges: { from: string; to: string; weight: number }[];
}

interface StorageData {
  graphIdCounter: number;
  graphs: SerializedGraph[];
}

export function ensureDataDir(): void {
  const dataDir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadData(): StorageData {
  ensureDataDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    return { graphIdCounter: 0, graphs: [] };
  }
  try {
    const content = fs.readFileSync(STORAGE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { graphIdCounter: 0, graphs: [] };
  }
}

export function saveData(data: StorageData): void {
  ensureDataDir();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data));
}

export function serializeGraph(graph: {
  id: string;
  directed: boolean;
  weighted: boolean;
  nodes: Set<string>;
  adjacency: Map<string, Map<string, number>>;
}): SerializedGraph {
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

  return {
    id: graph.id,
    directed: graph.directed,
    weighted: graph.weighted,
    nodes: Array.from(graph.nodes),
    edges,
  };
}

export function deserializeGraph(serialized: SerializedGraph): {
  id: string;
  directed: boolean;
  weighted: boolean;
  nodes: Set<string>;
  adjacency: Map<string, Map<string, number>>;
  reverseAdjacency: Map<string, Map<string, number>>;
} {
  const nodes = new Set(serialized.nodes);
  const adjacency = new Map<string, Map<string, number>>();
  const reverseAdjacency = new Map<string, Map<string, number>>();

  for (const node of nodes) {
    adjacency.set(node, new Map());
    reverseAdjacency.set(node, new Map());
  }

  for (const edge of serialized.edges) {
    adjacency.get(edge.from)!.set(edge.to, edge.weight);
    reverseAdjacency.get(edge.to)!.set(edge.from, edge.weight);

    if (!serialized.directed) {
      adjacency.get(edge.to)!.set(edge.from, edge.weight);
      reverseAdjacency.get(edge.from)!.set(edge.to, edge.weight);
    }
  }

  return {
    id: serialized.id,
    directed: serialized.directed,
    weighted: serialized.weighted,
    nodes,
    adjacency,
    reverseAdjacency,
  };
}
