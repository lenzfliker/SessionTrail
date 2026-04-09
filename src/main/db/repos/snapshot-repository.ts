import type Database from "better-sqlite3";
import type { AppStateSnapshotEntity } from "../entities";

export class SnapshotRepository {
  public constructor(private readonly db: Database.Database) {}

  public record(snapshot: AppStateSnapshotEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO app_state_snapshots (
            id,
            session_id,
            recorded_at,
            active_segment_id,
            worked_seconds_cached,
            pending_checkpoint_payload_json,
            pending_export_payload_json
          ) VALUES (
            @id,
            @sessionId,
            @recordedAt,
            @activeSegmentId,
            @workedSecondsCached,
            @pendingCheckpointPayloadJson,
            @pendingExportPayloadJson
          )
        `
      )
      .run(snapshot);
  }
}
