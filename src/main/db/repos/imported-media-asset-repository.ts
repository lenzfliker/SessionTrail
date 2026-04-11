import type Database from "better-sqlite3";
import type { ImportedMediaAssetEntity } from "../entities";

type ImportedMediaAssetRow = {
  id: string;
  session_id: string;
  kind: ImportedMediaAssetEntity["kind"];
  file_path: string;
  duration_ms: number | null;
  created_at: string;
};

function mapImportedMediaAssetRow(row: ImportedMediaAssetRow): ImportedMediaAssetEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

export class ImportedMediaAssetRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(asset: ImportedMediaAssetEntity): void {
    this.db.prepare(
      `
        INSERT INTO imported_media_assets (
          id,
          session_id,
          kind,
          file_path,
          duration_ms,
          created_at
        ) VALUES (
          @id,
          @sessionId,
          @kind,
          @filePath,
          @durationMs,
          @createdAt
        )
      `
    ).run(asset);
  }

  public findById(id: string): ImportedMediaAssetEntity | null {
    const row = this.db.prepare(
      `
        SELECT
          id,
          session_id,
          kind,
          file_path,
          duration_ms,
          created_at
        FROM imported_media_assets
        WHERE id = ?
      `
    ).get(id) as ImportedMediaAssetRow | undefined;

    return row ? mapImportedMediaAssetRow(row) : null;
  }

  public listBySessionId(sessionId: string): ImportedMediaAssetEntity[] {
    const rows = this.db.prepare(
      `
        SELECT
          id,
          session_id,
          kind,
          file_path,
          duration_ms,
          created_at
        FROM imported_media_assets
        WHERE session_id = ?
        ORDER BY created_at ASC
      `
    ).all(sessionId) as ImportedMediaAssetRow[];

    return rows.map(mapImportedMediaAssetRow);
  }

  public deleteById(id: string): void {
    this.db.prepare("DELETE FROM imported_media_assets WHERE id = ?").run(id);
  }
}
