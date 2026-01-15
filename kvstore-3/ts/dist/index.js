"use strict";
/**
 * Entry point for KVStore HTTP server
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
    console.log(`Starting KVStore server on port ${port}`);
    console.log(`Data directory: ${dataDir}`);
    // Initialize store and WAL
    const store = new store_1.KVStore();
    const wal = new wal_1.WAL(dataDir);
    // Replay WAL to restore state
    console.log('Replaying WAL...');
    await wal.replay(store);
    console.log('WAL replay complete');
    // Open WAL for writing
    wal.open();
    // Create and start server
    const app = (0, server_1.createServer)(store, wal);
    const server = app.listen(port, () => {
        console.log(`KVStore server listening on port ${port}`);
    });
    // Graceful shutdown
    const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => {
            wal.close();
            console.log('Server stopped');
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
