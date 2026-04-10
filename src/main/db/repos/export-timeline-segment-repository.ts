import type Database from "better-sqlite3";
import type { ExportTimelineSegmentEntity } from "../entities";

type ExportTimelineSegmentRow = {
  id: string;
  session_id: string;
  checkpoint_id: string;
  start_offset_ms: number;
  end_offset_ms: number;
  sort_order: number;
  source: ExportTimelineSegmentEntity["source"];
  created_at: string;
  updated_at: string;
};

function mapExportTimelineSegmentRow(row: ExportTimelineSegmentRow): ExportTimelineSegmentEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    checkpointId: row.checkpoint_id,
    startOffsetMs: row.start_offset_ms,
    endOffsetMs: row.end_offset_ms,
    sortOrder: row.sort_order,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ExportTimelineSegmentRepository {
  public constructor(private readonly db: Database.Database) {}

  public replaceForSession(sessionId: string, segments: ExportTimelineSegmentEntity[]): void {
    const replace = this.db.transaction(() => {
      this.db.prepare("DELETE FROM export_timeline_segments WHERE session_id = ?").run(sessionId);
      const statement = this.db.prepare(
        `
          INSERT INTO export_timeline_segments (
            id,
            session_id,
            checkpoint_id,
            start_offset_ms,
            end_offset_ms,
            sort_order,
            source,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @sessionId,
            @checkpointId,
            @startOffsetMs,
            @endOffsetMs,
            @sortOrder,
            @source,
            @createdAt,
            @updatedAt
          )
        `
      );

      for (const segment of segments) {
        statement.run(segment);
      }
    });

    replace();
  }

  public listBySessionId(sessionId: string): ExportTimelineSegmentEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            checkpoint_id,
            start_offset_ms,
            end_offset_ms,
            sort_order,
            source,
            created_at,
            updated_at
          FROM export_timeline_segments
          WHERE session_id = ?
          ORDER BY sort_order ASC, start_offset_ms ASC
        `
      )
      .all(sessionId) as ExportTimelineSegmentRow[];

    return rows.map(mapExportTimelineSegmentRow);
  }

  public countByCheckpointId(checkpointId: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS segment_count
          FROM export_timeline_segments
          WHERE checkpoint_id = ?
        `
      )
      .get(checkpointId) as { segment_count: number } | undefined;

    return row?.segment_count ?? 0;
  }
}
