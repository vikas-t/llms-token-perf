/**
 * Entry point for the KVStore server.
 */

import { createServer } from "./server";

function parseArgs(): { port: number; dataDir: string } {
  const args = process.argv.slice(2);
  let port = 8080;
  let dataDir = "./data";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--data-dir" && args[i + 1]) {
      dataDir = args[i + 1];
      i++;
    }
  }

  // Environment variables override CLI args
  if (process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
  }
  if (process.env.DATA_DIR) {
    dataDir = process.env.DATA_DIR;
  }

  return { port, dataDir };
}

function main(): void {
  const { port, dataDir } = parseArgs();
  const server = createServer(port, dataDir);
  server.start();
}

main();
