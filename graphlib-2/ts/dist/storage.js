"use strict";
// Persistent storage for graphs using a temp file
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextId = getNextId;
exports.storeGraph = storeGraph;
exports.loadGraph = loadGraph;
exports.deleteGraph = deleteGraph;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const STORAGE_FILE = path.join(os.tmpdir(), 'graphlib-ts-storage.json');
function loadStorage() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            return JSON.parse(data);
        }
    }
    catch {
        // ignore errors
    }
    return { graphs: {}, counter: 0 };
}
function saveStorage(storage) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage), 'utf8');
}
function getNextId() {
    const storage = loadStorage();
    storage.counter++;
    saveStorage(storage);
    return `graph-${storage.counter}`;
}
function storeGraph(graph) {
    const storage = loadStorage();
    const edges = [];
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
function loadGraph(graphId) {
    const storage = loadStorage();
    const stored = storage.graphs[graphId];
    if (!stored)
        return undefined;
    const graph = {
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
        graph.adjacency.get(edge.from).set(edge.to, edge.weight);
        graph.inEdges.get(edge.to).set(edge.from, edge.weight);
    }
    return graph;
}
function deleteGraph(graphId) {
    const storage = loadStorage();
    delete storage.graphs[graphId];
    saveStorage(storage);
}
