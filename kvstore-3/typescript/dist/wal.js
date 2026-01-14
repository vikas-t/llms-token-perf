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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
class WAL {
    constructor(dataDir) {
        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.filePath = path.join(dataDir, 'wal.log');
    }
    /**
     * Open WAL file for writing (append mode)
     */
    open() {
        // Create the file if it doesn't exist
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, '');
        }
    }
    /**
     * Close WAL file
     */
    close() {
        // Nothing to do for sync writes
    }
    /**
     * Log a set operation
     */
    async logSet(key, value, expiresAt) {
        const entry = {
            op: 'set',
            key,
            value,
            expiresAt,
            timestamp: (0, utils_1.getCurrentTimestamp)(),
        };
        await this.writeEntry(entry);
    }
    /**
     * Log a delete operation
     */
    async logDelete(key) {
        const entry = {
            op: 'delete',
            key,
            timestamp: (0, utils_1.getCurrentTimestamp)(),
        };
        await this.writeEntry(entry);
    }
    /**
     * Write an entry to the WAL using synchronous append
     */
    async writeEntry(entry) {
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(this.filePath, line, 'utf-8');
    }
    /**
     * Replay WAL to restore store state
     */
    async replay(store) {
        if (!fs.existsSync(this.filePath)) {
            return; // No WAL file exists yet
        }
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.trim().split('\n');
        for (const line of lines) {
            if (line.trim() === '') {
                continue;
            }
            try {
                const entry = JSON.parse(line);
                if (entry.op === 'set') {
                    store.set(entry.key, entry.value, entry.expiresAt || null);
                }
                else if (entry.op === 'delete') {
                    store.delete(entry.key);
                }
            }
            catch (err) {
                console.error('Failed to parse WAL entry:', line, err);
            }
        }
    }
}
exports.WAL = WAL;
