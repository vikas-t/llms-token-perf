"use strict";
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
exports.ensureDataDir = ensureDataDir;
exports.loadData = loadData;
exports.saveData = saveData;
exports.serializeGraph = serializeGraph;
exports.deserializeGraph = deserializeGraph;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STORAGE_FILE = path.join(__dirname, '..', 'data', 'graphs.json');
function ensureDataDir() {
    const dataDir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}
function loadData() {
    ensureDataDir();
    if (!fs.existsSync(STORAGE_FILE)) {
        return { graphIdCounter: 0, graphs: [] };
    }
    try {
        const content = fs.readFileSync(STORAGE_FILE, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { graphIdCounter: 0, graphs: [] };
    }
}
function saveData(data) {
    ensureDataDir();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data));
}
function serializeGraph(graph) {
    const edges = [];
    const seen = new Set();
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
function deserializeGraph(serialized) {
    const nodes = new Set(serialized.nodes);
    const adjacency = new Map();
    const reverseAdjacency = new Map();
    for (const node of nodes) {
        adjacency.set(node, new Map());
        reverseAdjacency.set(node, new Map());
    }
    for (const edge of serialized.edges) {
        adjacency.get(edge.from).set(edge.to, edge.weight);
        reverseAdjacency.get(edge.to).set(edge.from, edge.weight);
        if (!serialized.directed) {
            adjacency.get(edge.to).set(edge.from, edge.weight);
            reverseAdjacency.get(edge.from).set(edge.to, edge.weight);
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
