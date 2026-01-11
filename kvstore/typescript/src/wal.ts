/**
 * Write-ahead log for persistence.
 */

import * as fs from "fs";
import * as path from "path";

interface WALEntry {
  op: "set" | "delete";
  key: string;
  value?: unknown;
  expiry?: number; // Unix timestamp in ms
}

export class WAL {
  private walPath: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.walPath = path.join(dataDir, "wal.log");
  }

  append(
    op: "set" | "delete",
    key: string,
    value?: unknown,
    expiry?: number | null
  ): void {
    const entry: WALEntry = { op, key };
    if (value !== undefined) {
      entry.value = value;
    }
    if (expiry !== undefined && expiry !== null) {
      entry.expiry = expiry;
    }

    fs.appendFileSync(this.walPath, JSON.stringify(entry) + "\n");
  }

  replay(
    onSet: (key: string, value: unknown, expiry: number | null) => void,
    onDelete: (key: string) => void
  ): void {
    if (!fs.existsSync(this.walPath)) {
      return;
    }

    const content = fs.readFileSync(this.walPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const entry: WALEntry = JSON.parse(trimmed);

        if (entry.op === "set") {
          const expiry = entry.expiry !== undefined ? entry.expiry : null;
          onSet(entry.key, entry.value, expiry);
        } else if (entry.op === "delete") {
          onDelete(entry.key);
        }
      } catch {
        // Skip corrupted entries
        continue;
      }
    }
  }
}
