"use strict";
/**
 * Main entry point for the KVStore HTTP server
 */
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("./store");
const wal_1 = require("./wal");
const server_1 = require("./server");
// Parse command-line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let port = parseInt(process.env.PORT || '8080', 10);
    let dataDir = process.env.DATA_DIR || './data';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && i + 1 < args.length) {
            port = parseInt(args[i + 1], 10);
            i++;
        }
        else if (args[i] === '--data-dir' && i + 1 < args.length) {
            dataDir = args[i + 1];
            i++;
        }
    }
    return { port, dataDir };
}
async function main() {
    const { port, dataDir } = parseArgs();
    console.log(`Starting KVStore server...`);
    console.log(`Port: ${port}`);
    console.log(`Data directory: ${dataDir}`);
    // Initialize store and WAL
    const store = new store_1.KVStore();
    const wal = new wal_1.WAL(dataDir);
    // Initialize WAL (create directory and open file)
    await wal.init();
    // Replay WAL to restore state
    console.log('Replaying WAL...');
    const operations = await wal.replay();
    for (const operation of operations) {
        if (operation.op === 'set') {
            store.set(operation.key, operation.value, operation.ttl);
        }
        else if (operation.op === 'delete') {
            store.delete(operation.key);
        }
    }
    console.log(`Replayed ${operations.length} operations`);
    // Create and start HTTP server
    const app = (0, server_1.createApp)(store, wal);
    const server = app.listen(port, () => {
        console.log(`KVStore server listening on port ${port}`);
    });
    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        server.close(async () => {
            await wal.close();
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        server.close(async () => {
            await wal.close();
            process.exit(0);
        });
    });
}
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
