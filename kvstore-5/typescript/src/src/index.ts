/**
 * HTTP server entry point with CLI argument parsing
 */

import { KVStore } from './store';
import { WAL } from './wal';
import { createApp } from './server';

interface Config {
  port: number;
  dataDir: string;
}

/**
 * Parse command-line arguments and environment variables
 */
function parseConfig(): Config {
  const args = process.argv.slice(2);

  let port = parseInt(process.env.PORT || '8080', 10);
  let dataDir = process.env.DATA_DIR || './data';

  // Parse command-line arguments
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

/**
 * Main entry point
 */
async function main() {
  const config = parseConfig();

  console.log(`Starting KVStore server...`);
  console.log(`Port: ${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);

  // Initialize store and WAL
  const store = new KVStore();
  const wal = new WAL(config.dataDir);

  await wal.initialize();

  // Replay WAL to restore state
  console.log('Replaying WAL...');
  await wal.replay(store);
  console.log('WAL replay complete');

  // Create and start HTTP server
  const app = createApp(store, wal);

  const server = app.listen(config.port, () => {
    console.log(`KVStore server listening on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    server.close(async () => {
      console.log('HTTP server closed');
      await wal.close();
      console.log('WAL closed');
      process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run the server
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
