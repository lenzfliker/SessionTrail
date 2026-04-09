import type Database from "better-sqlite3";
import type { RuntimeStateEntity } from "../entities";

type RuntimeStateRow = {
  key: string;
  value: string;
  updated_at: string;
};

function mapRuntimeStateRow(row: RuntimeStateRow): RuntimeStateEntity {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at
  };
}

export class RuntimeStateRepository {
  public constructor(private readonly db: Database.Database) {}

  public get(key: string): RuntimeStateEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT key, value, updated_at
          FROM runtime_state
          WHERE key = ?
        `
      )
      .get(key) as RuntimeStateRow | undefined;

    return row ? mapRuntimeStateRow(row) : null;
  }

  public set(key: string, value: string): void {
    this.db
      .prepare(
        `
          INSERT INTO runtime_state (key, value, updated_at)
          VALUES (@key, @value, @updatedAt)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
      )
      .run({
        key,
        value,
        updatedAt: new Date().toISOString()
      });
  }

  public delete(key: string): void {
    this.db.prepare("DELETE FROM runtime_state WHERE key = ?").run(key);
  }
}
