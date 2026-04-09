import type Database from "better-sqlite3";
import type { VideoAssetEntity } from "../entities";

type VideoAssetRow = {
  id: string;
  session_id: string;
  type: VideoAssetEntity["type"];
  file_path: string;
  duration_ms: number | null;
  created_at: string;
};

function mapVideoAssetRow(row: VideoAssetRow): VideoAssetEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

export class VideoAssetRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(asset: VideoAssetEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO video_assets (
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            created_at
          ) VALUES (
            @id,
            @sessionId,
            @type,
            @filePath,
            @durationMs,
            @createdAt
          )
        `
      )
      .run(asset);
  }

  public findLatestBySessionAndType(
    sessionId: string,
    type: VideoAssetEntity["type"]
  ): VideoAssetEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            created_at
          FROM video_assets
          WHERE session_id = ? AND type = ?
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(sessionId, type) as VideoAssetRow | undefined;

    return row ? mapVideoAssetRow(row) : null;
  }

  public findById(id: string): VideoAssetEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            created_at
          FROM video_assets
          WHERE id = ?
        `
      )
      .get(id) as VideoAssetRow | undefined;

    return row ? mapVideoAssetRow(row) : null;
  }
}
