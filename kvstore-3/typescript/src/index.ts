/**
 * Entry point for KVStore HTTP server
 */

import { KVStore } from './store';
import { WAL } from './wal';
import { createServer } from './server';

// Parse command-line arguments
function parseArgs(): { port: number; dataDir: string } {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || '8080', 10);
  let dataDir = process.env.DATA_DIR || './data';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--data-dir' && i + 1 < args.length) {
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
  const store = new KVStore();
  const wal = new WAL(dataDir);

  // Replay WAL to restore state
  console.log('Replaying WAL...');
  await wal.replay(store);
  console.log('WAL replay complete');

  // Open WAL for writing
  wal.open();

  // Create and start server
  const app = createServer(store, wal);

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
