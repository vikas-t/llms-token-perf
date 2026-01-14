"use strict";
/**
 * Write-Ahead Log implementation for persistence
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
     * Initialize the WAL (open file, create directory if needed)
     */
    async init() {
        // Create data directory if it doesn't exist
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        // Open file in append mode
        this.fileHandle = await fs.open(this.filePath, 'a');
    }
    /**
     * Log a set operation
     */
    async logSet(key, value, ttl) {
        const operation = {
            op: 'set',
            key,
            value,
            ttl,
            timestamp: (0, utils_1.getTimestamp)(),
        };
        await this.writeOperation(operation);
    }
    /**
     * Log a delete operation
     */
    async logDelete(key) {
        const operation = {
            op: 'delete',
            key,
            timestamp: (0, utils_1.getTimestamp)(),
        };
        await this.writeOperation(operation);
    }
    /**
     * Write an operation to the log file
     */
    async writeOperation(operation) {
        if (!this.fileHandle) {
            throw new Error('WAL not initialized');
        }
        const line = JSON.stringify(operation) + '\n';
        await this.fileHandle.write(line);
        // Ensure data is written to disk
        await this.fileHandle.datasync();
    }
    /**
     * Replay the WAL to restore state
     * @param store The KVStore instance to restore into
     */
    async replay(store) {
        // Check if WAL file exists
        try {
            await fs.access(this.filePath);
        }
        catch {
            // File doesn't exist, nothing to replay
            return;
        }
        // Read and replay each line
        const content = await fs.readFile(this.filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim() !== '');
        for (const line of lines) {
            try {
                const operation = JSON.parse(line);
                if (operation.op === 'set') {
                    // Calculate remaining TTL based on original timestamp
                    let ttl = undefined;
                    if (operation.ttl !== undefined) {
                        const elapsed = (0, utils_1.getTimestamp)() - operation.timestamp;
                        const remaining = operation.ttl - elapsed;
                        // Only set if not already expired
                        if (remaining > 0) {
                            ttl = remaining;
                        }
                        else {
                            // Skip expired entries during replay
                            continue;
                        }
                    }
                    store.set(operation.key, operation.value, ttl);
                }
                else if (operation.op === 'delete') {
                    store.delete(operation.key);
                }
            }
            catch (error) {
                // Skip malformed lines
                console.error(`Error replaying WAL line: ${line}`, error);
            }
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
