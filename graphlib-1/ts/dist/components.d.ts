import { HasCycleResult, IsDagResult, TopologicalSortResult, ConnectedComponentsResult, IsConnectedResult } from './types';
export declare function hasCycle(graphId: string): HasCycleResult;
export declare function isDag(graphId: string): IsDagResult;
export declare function topologicalSort(graphId: string): TopologicalSortResult;
export declare function connectedComponents(graphId: string): ConnectedComponentsResult;
export declare function stronglyConnectedComponents(graphId: string): ConnectedComponentsResult;
export declare function isConnected(graphId: string): IsConnectedResult;
