import { HasCycleResult, IsDAGResult, TopologicalSortResult, ConnectedComponentsResult, IsConnectedResult } from './types';
export declare function hasCycle(graphId: string): HasCycleResult;
export declare function isDAG(graphId: string): IsDAGResult;
export declare function topologicalSort(graphId: string): TopologicalSortResult;
export declare function connectedComponents(graphId: string): ConnectedComponentsResult;
export declare function stronglyConnectedComponents(graphId: string): ConnectedComponentsResult;
export declare function isConnected(graphId: string): IsConnectedResult;
