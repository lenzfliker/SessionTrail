import type Database from "better-sqlite3";
import type { ScreenshotAssetEntity } from "../entities";

type ScreenshotAssetRow = {
  id: string;
  checkpoint_id: string;
  file_path: string;
  width: number | null;
  height: number | null;
  capture_mode: ScreenshotAssetEntity["captureMode"];
  created_at: string;
};

function mapScreenshotAssetRow(row: ScreenshotAssetRow): ScreenshotAssetEntity {
  return {
    id: row.id,
    checkpointId: row.checkpoint_id,
    filePath: row.file_path,
    width: row.width,
    height: row.height,
    captureMode: row.capture_mode,
    createdAt: row.created_at
  };
}

export class ScreenshotAssetRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(asset: ScreenshotAssetEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO screenshot_assets (
            id,
            checkpoint_id,
            file_path,
            width,
            height,
            capture_mode,
            created_at
          ) VALUES (
            @id,
            @checkpointId,
            @filePath,
            @width,
            @height,
            @captureMode,
            @createdAt
          )
        `
      )
      .run(asset);
  }

  public findByCheckpointId(checkpointId: string): ScreenshotAssetEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            checkpoint_id,
            file_path,
            width,
            height,
            capture_mode,
            created_at
          FROM screenshot_assets
          WHERE checkpoint_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(checkpointId) as ScreenshotAssetRow | undefined;

    return row ? mapScreenshotAssetRow(row) : null;
  }
}

