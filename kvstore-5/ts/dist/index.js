"use strict";
/**
 * Entry point for the KVStore HTTP server
 */
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("./store");
const wal_1 = require("./wal");
const server_1 = require("./server");
/**
 * Parse command-line arguments and environment variables
 */
function getConfig() {
    let port = parseInt(process.env.PORT || '8080', 10);
    let dataDir = process.env.DATA_DIR || './data';
    // Parse command-line arguments
    const args = process.argv.slice(2);
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
/**
 * Main server initialization
 */
async function main() {
    const { port, dataDir } = getConfig();
    console.log(`Starting KVStore server...`);
    console.log(`Port: ${port}`);
    console.log(`Data directory: ${dataDir}`);
    // Initialize store and WAL
    const store = new store_1.KVStore();
    const wal = new wal_1.WAL(dataDir);
    // Initialize WAL
    await wal.init();
    // Replay WAL to restore state
    console.log('Replaying WAL...');
    await wal.replay(store);
    console.log('WAL replay complete');
    // Create and start server
    const app = (0, server_1.createServer)(store, wal);
    const server = app.listen(port, () => {
        console.log(`KVStore server listening on port ${port}`);
    });
    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        server.close();
        await wal.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
// Run the server
main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
