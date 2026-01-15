interface SerializedGraph {
    id: string;
    directed: boolean;
    weighted: boolean;
    nodes: string[];
    edges: {
        from: string;
        to: string;
        weight: number;
    }[];
}
interface StorageData {
    graphIdCounter: number;
    graphs: SerializedGraph[];
}
export declare function ensureDataDir(): void;
export declare function loadData(): StorageData;
export declare function saveData(data: StorageData): void;
export declare function serializeGraph(graph: {
    id: string;
    directed: boolean;
    weighted: boolean;
    nodes: Set<string>;
    adjacency: Map<string, Map<string, number>>;
}): SerializedGraph;
export declare function deserializeGraph(serialized: SerializedGraph): {
    id: string;
    directed: boolean;
    weighted: boolean;
    nodes: Set<string>;
    adjacency: Map<string, Map<string, number>>;
    reverseAdjacency: Map<string, Map<string, number>>;
};
export {};
