export interface Edge {
  from: string;
  to: string;
  weight: number;
}

export interface Graph {
  id: string;
  directed: boolean;
  weighted: boolean;
  nodes: Set<string>;
  adjacency: Map<string, Map<string, number>>;
  reverseAdjacency: Map<string, Map<string, number>>;
}

export interface GraphInfo {
  id: string;
  directed: boolean;
  weighted: boolean;
  node_count: number;
  edge_count: number;
  is_connected?: boolean;
  has_cycle?: boolean;
}

export interface CreateGraphResult {
  id: string;
  directed: boolean;
  weighted: boolean;
  node_count: number;
  edge_count: number;
}

export interface AddNodeResult {
  success: boolean;
  node_id?: string;
  error?: string;
}

export interface AddEdgeResult {
  success: boolean;
  from?: string;
  to?: string;
  weight?: number;
  error?: string;
}

export interface RemoveNodeResult {
  success: boolean;
  removed_edges?: number;
  error?: string;
}

export interface RemoveEdgeResult {
  success: boolean;
  error?: string;
}

export interface GetNodesResult {
  nodes: string[];
  count: number;
}

export interface GetEdgesResult {
  edges: Edge[];
  count: number;
}

export interface GetNeighborsResult {
  neighbors: string[];
  count: number;
}

export interface HasNodeResult {
  exists: boolean;
}

export interface HasEdgeResult {
  exists: boolean;
  weight?: number;
}

export interface GetDegreeResult {
  degree: number;
  in_degree: number;
  out_degree: number;
}

export interface BFSResult {
  order: string[];
  levels: Record<string, number>;
  parent: Record<string, string>;
}

export interface DFSResult {
  order: string[];
  discovery: Record<string, number>;
  finish: Record<string, number>;
  parent: Record<string, string>;
}

export interface ShortestPathResult {
  exists: boolean;
  path: string[];
  distance: number;
}

export interface AllShortestPathsResult {
  distances: Record<string, number>;
  paths: Record<string, string[]>;
  unreachable: string[];
}

export interface HasPathResult {
  exists: boolean;
}

export interface HasCycleResult {
  has_cycle: boolean;
  cycle: string[];
}

export interface IsDagResult {
  is_dag: boolean;
}

export interface TopologicalSortResult {
  success: boolean;
  order?: string[];
  error?: string;
}

export interface ConnectedComponentsResult {
  count: number;
  components: string[][];
}

export interface IsConnectedResult {
  is_connected: boolean;
}

export interface ClearGraphResult {
  success: boolean;
}

export interface SubgraphResult extends CreateGraphResult {}

export interface CloneGraphResult extends CreateGraphResult {}
