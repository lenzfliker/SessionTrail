import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

let databaseInstance: Database.Database | null = null;
let databasePath = "";

export function getDatabasePath(): string {
  if (!databasePath) {
    databasePath = join(app.getPath("userData"), "data", "sessiontrail.db");
  }

  return databasePath;
}

export function getDatabase(): Database.Database {
  if (databaseInstance) {
    return databaseInstance;
  }

  const resolvedPath = getDatabasePath();
  mkdirSync(dirname(resolvedPath), { recursive: true });

  databaseInstance = new Database(resolvedPath);
  databaseInstance.pragma("journal_mode = WAL");
  databaseInstance.pragma("foreign_keys = ON");

  return databaseInstance;
}

export function closeDatabase(): void {
  if (!databaseInstance) {
    return;
  }

  databaseInstance.close();
  databaseInstance = null;
}

