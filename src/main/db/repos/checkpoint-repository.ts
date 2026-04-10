import type Database from "better-sqlite3";
import type { CheckpointEntity } from "../entities";

type CheckpointRow = {
  id: string;
  session_id: string;
  occurred_at: string;
  worked_offset_seconds: number;
  status: CheckpointEntity["status"];
  note_text: string | null;
  reminder_triggered: number;
  manual_checkpoint: number;
  created_at: string;
  updated_at: string;
};

function mapCheckpointRow(row: CheckpointRow): CheckpointEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    occurredAt: row.occurred_at,
    workedOffsetSeconds: row.worked_offset_seconds,
    status: row.status,
    noteText: row.note_text,
    reminderTriggered: row.reminder_triggered === 1,
    manualCheckpoint: row.manual_checkpoint === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CheckpointRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(checkpoint: CheckpointEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO checkpoints (
            id,
            session_id,
            occurred_at,
            worked_offset_seconds,
            status,
            note_text,
            reminder_triggered,
            manual_checkpoint,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @sessionId,
            @occurredAt,
            @workedOffsetSeconds,
            @status,
            @noteText,
            @reminderTriggered,
            @manualCheckpoint,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        ...checkpoint,
        reminderTriggered: checkpoint.reminderTriggered ? 1 : 0,
        manualCheckpoint: checkpoint.manualCheckpoint ? 1 : 0
      });
  }

  public update(checkpoint: CheckpointEntity): void {
    this.db
      .prepare(
        `
          UPDATE checkpoints
          SET
            session_id = @sessionId,
            occurred_at = @occurredAt,
            worked_offset_seconds = @workedOffsetSeconds,
            status = @status,
            note_text = @noteText,
            reminder_triggered = @reminderTriggered,
            manual_checkpoint = @manualCheckpoint,
            created_at = @createdAt,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        ...checkpoint,
        reminderTriggered: checkpoint.reminderTriggered ? 1 : 0,
        manualCheckpoint: checkpoint.manualCheckpoint ? 1 : 0
      });
  }

  public delete(checkpointId: string): void {
    this.db
      .prepare(
        `
          DELETE FROM checkpoints
          WHERE id = ?
        `
      )
      .run(checkpointId);
  }

  public findById(checkpointId: string): CheckpointEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            occurred_at,
            worked_offset_seconds,
            status,
            note_text,
            reminder_triggered,
            manual_checkpoint,
            created_at,
            updated_at
          FROM checkpoints
          WHERE id = ?
        `
      )
      .get(checkpointId) as CheckpointRow | undefined;

    return row ? mapCheckpointRow(row) : null;
  }

  public findLatestReminderOffset(sessionId: string): number | null {
    const row = this.db
      .prepare(
        `
          SELECT MAX(worked_offset_seconds) AS max_offset
          FROM checkpoints
          WHERE session_id = ? AND reminder_triggered = 1
        `
      )
      .get(sessionId) as { max_offset: number | null } | undefined;

    return row?.max_offset ?? null;
  }

  public listBySessionId(sessionId: string): CheckpointEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            occurred_at,
            worked_offset_seconds,
            status,
            note_text,
            reminder_triggered,
            manual_checkpoint,
            created_at,
            updated_at
          FROM checkpoints
          WHERE session_id = ?
          ORDER BY occurred_at ASC
        `
      )
      .all(sessionId) as CheckpointRow[];

    return rows.map(mapCheckpointRow);
  }

  public listShellsBySessionId(sessionId: string): CheckpointEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            occurred_at,
            worked_offset_seconds,
            status,
            note_text,
            reminder_triggered,
            manual_checkpoint,
            created_at,
            updated_at
          FROM checkpoints
          WHERE session_id = ? AND status = 'shell'
          ORDER BY occurred_at ASC
        `
      )
      .all(sessionId) as CheckpointRow[];

    return rows.map(mapCheckpointRow);
  }

  public findLatestShell(): CheckpointEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            occurred_at,
            worked_offset_seconds,
            status,
            note_text,
            reminder_triggered,
            manual_checkpoint,
            created_at,
            updated_at
          FROM checkpoints
          WHERE status = 'shell'
          ORDER BY updated_at DESC
          LIMIT 1
        `
      )
      .get() as CheckpointRow | undefined;

    return row ? mapCheckpointRow(row) : null;
  }
}
