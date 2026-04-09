import type Database from "better-sqlite3";
import type { ExportCompositionEntity } from "../entities";

type ExportCompositionRow = {
  session_id: string;
  voice_over_asset_id: string | null;
  appendix_video_asset_id: string | null;
  output_file_path: string | null;
  duration_ms: number;
  created_at: string;
  updated_at: string;
};

function mapExportCompositionRow(row: ExportCompositionRow): ExportCompositionEntity {
  return {
    sessionId: row.session_id,
    voiceOverAssetId: row.voice_over_asset_id,
    appendixVideoAssetId: row.appendix_video_asset_id,
    outputFilePath: row.output_file_path,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ExportCompositionRepository {
  public constructor(private readonly db: Database.Database) {}

  public upsert(composition: ExportCompositionEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO export_compositions (
            session_id,
            voice_over_asset_id,
            appendix_video_asset_id,
            output_file_path,
            duration_ms,
            created_at,
            updated_at
          ) VALUES (
            @sessionId,
            @voiceOverAssetId,
            @appendixVideoAssetId,
            @outputFilePath,
            @durationMs,
            @createdAt,
            @updatedAt
          )
          ON CONFLICT(session_id) DO UPDATE SET
            voice_over_asset_id = excluded.voice_over_asset_id,
            appendix_video_asset_id = excluded.appendix_video_asset_id,
            output_file_path = excluded.output_file_path,
            duration_ms = excluded.duration_ms,
            updated_at = excluded.updated_at
        `
      )
      .run(composition);
  }

  public findBySessionId(sessionId: string): ExportCompositionEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            session_id,
            voice_over_asset_id,
            appendix_video_asset_id,
            output_file_path,
            duration_ms,
            created_at,
            updated_at
          FROM export_compositions
          WHERE session_id = ?
        `
      )
      .get(sessionId) as ExportCompositionRow | undefined;

    return row ? mapExportCompositionRow(row) : null;
  }
}
