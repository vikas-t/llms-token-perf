import { ShortestPathResult, AllShortestPathsResult, HasPathResult } from './types';
export declare function shortestPath(graphId: string, startNode: string, endNode: string): ShortestPathResult;
export declare function allShortestPaths(graphId: string, startNode: string): AllShortestPathsResult;
export declare function hasPath(graphId: string, startNode: string, endNode: string): HasPathResult;
