"use strict";
/**
 * Write-Ahead Log (WAL) implementation for persistence
 */
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
exports.WAL = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
class WAL {
    constructor(dataDir) {
        this.fileHandle = null;
        this.filePath = path.join(dataDir, 'wal.log');
    }
    /**
     * Initialize the WAL file
     */
    async init() {
        // Ensure the directory exists
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        // Open file in append mode
        this.fileHandle = await fs.open(this.filePath, 'a');
    }
    /**
     * Append an operation to the WAL
     */
    async append(op, key, value, ttl) {
        const operation = {
            op,
            key,
            timestamp: (0, utils_1.getCurrentTimestamp)(),
        };
        if (op === 'set') {
            operation.value = value;
            if (ttl !== undefined && ttl !== null) {
                operation.ttl = ttl;
            }
        }
        const line = JSON.stringify(operation) + '\n';
        if (this.fileHandle) {
            await this.fileHandle.write(line);
            // Flush to disk to ensure durability
            await this.fileHandle.datasync();
        }
    }
    /**
     * Replay the WAL and return all operations
     */
    async replay() {
        try {
            const content = await fs.readFile(this.filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.length > 0);
            return lines.map(line => JSON.parse(line));
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                // File doesn't exist yet, return empty array
                return [];
            }
            throw err;
        }
    }
    /**
     * Close the WAL file
     */
    async close() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }
}
exports.WAL = WAL;
