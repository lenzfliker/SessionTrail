import type Database from "better-sqlite3";
import type { AudioAssetEntity } from "../entities";

type AudioAssetRow = {
  id: string;
  session_id: string;
  type: AudioAssetEntity["type"];
  file_path: string;
  duration_ms: number | null;
  trim_start_ms: number;
  trim_end_ms: number | null;
  created_at: string;
};

function mapAudioAssetRow(row: AudioAssetRow): AudioAssetEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    trimStartMs: row.trim_start_ms,
    trimEndMs: row.trim_end_ms,
    createdAt: row.created_at
  };
}

export class AudioAssetRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(asset: AudioAssetEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO audio_assets (
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            trim_start_ms,
            trim_end_ms,
            created_at
          ) VALUES (
            @id,
            @sessionId,
            @type,
            @filePath,
            @durationMs,
            @trimStartMs,
            @trimEndMs,
            @createdAt
          )
        `
      )
      .run(asset);
  }

  public update(asset: AudioAssetEntity): void {
    this.db
      .prepare(
        `
          UPDATE audio_assets
          SET
            session_id = @sessionId,
            type = @type,
            file_path = @filePath,
            duration_ms = @durationMs,
            trim_start_ms = @trimStartMs,
            trim_end_ms = @trimEndMs,
            created_at = @createdAt
          WHERE id = @id
        `
      )
      .run(asset);
  }

  public findById(id: string): AudioAssetEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            trim_start_ms,
            trim_end_ms,
            created_at
          FROM audio_assets
          WHERE id = ?
        `
      )
      .get(id) as AudioAssetRow | undefined;

    return row ? mapAudioAssetRow(row) : null;
  }

  public findLatestVoiceOverBySessionId(sessionId: string): AudioAssetEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            file_path,
            duration_ms,
            trim_start_ms,
            trim_end_ms,
            created_at
          FROM audio_assets
          WHERE session_id = ? AND type = 'voice_over'
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(sessionId) as AudioAssetRow | undefined;

    return row ? mapAudioAssetRow(row) : null;
  }
}

