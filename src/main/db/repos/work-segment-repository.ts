import type Database from "better-sqlite3";
import type { WorkSegmentCloseReason, WorkSegmentEntity } from "../entities";

type WorkSegmentRow = {
  id: string;
  session_id: string;
  type: WorkSegmentEntity["type"];
  started_at: string;
  ended_at: string | null;
  worked_seconds: number;
  close_reason: WorkSegmentCloseReason;
  created_at: string;
};

function mapWorkSegmentRow(row: WorkSegmentRow): WorkSegmentEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    workedSeconds: row.worked_seconds,
    closeReason: row.close_reason,
    createdAt: row.created_at
  };
}

export class WorkSegmentRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(segment: WorkSegmentEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO work_segments (
            id,
            session_id,
            type,
            started_at,
            ended_at,
            worked_seconds,
            close_reason,
            created_at
          ) VALUES (
            @id,
            @sessionId,
            @type,
            @startedAt,
            @endedAt,
            @workedSeconds,
            @closeReason,
            @createdAt
          )
        `
      )
      .run(segment);
  }

  public update(segment: WorkSegmentEntity): void {
    this.db
      .prepare(
        `
          UPDATE work_segments
          SET
            session_id = @sessionId,
            type = @type,
            started_at = @startedAt,
            ended_at = @endedAt,
            worked_seconds = @workedSeconds,
            close_reason = @closeReason,
            created_at = @createdAt
          WHERE id = @id
        `
      )
      .run(segment);
  }

  public findOpenBySessionId(sessionId: string): WorkSegmentEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            started_at,
            ended_at,
            worked_seconds,
            close_reason,
            created_at
          FROM work_segments
          WHERE session_id = ? AND ended_at IS NULL
          ORDER BY started_at DESC
          LIMIT 1
        `
      )
      .get(sessionId) as WorkSegmentRow | undefined;

    return row ? mapWorkSegmentRow(row) : null;
  }

  public listBySessionId(sessionId: string): WorkSegmentEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            type,
            started_at,
            ended_at,
            worked_seconds,
            close_reason,
            created_at
          FROM work_segments
          WHERE session_id = ?
          ORDER BY started_at ASC
        `
      )
      .all(sessionId) as WorkSegmentRow[];

    return rows.map(mapWorkSegmentRow);
  }
}

