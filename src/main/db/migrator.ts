import type Database from "better-sqlite3";
import { migrations } from "./migrations";

type AppliedMigrationRow = {
  id: string;
};

export function runMigrations(db: Database.Database): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id ASC")
    .all() as AppliedMigrationRow[];

  const appliedIds = new Set(appliedRows.map((row) => row.id));
  const executedIds: string[] = [];

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (@id, @appliedAt)"
      ).run({
        id: migration.id,
        appliedAt: new Date().toISOString()
      });
    });

    applyMigration();
    executedIds.push(migration.id);
  }

  return executedIds;
}

