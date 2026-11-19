// Deletes the local database so the next start re-seeds it. Uploaded files are kept.
import fs from "node:fs";
import { config } from "../config.ts";

for (const suffix of ["", "-wal", "-shm"]) {
  const f = config.dbFile + suffix;
  if (fs.existsSync(f)) fs.rmSync(f);
}
console.log(`Database removed: ${config.dbFile}`);
