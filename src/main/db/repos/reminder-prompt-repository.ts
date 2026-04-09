import type Database from "better-sqlite3";
import type { ReminderPromptEntity } from "../entities";

type ReminderPromptRow = {
  id: string;
  session_id: string;
  worked_offset_seconds: number;
  status: ReminderPromptEntity["status"];
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function mapReminderPromptRow(row: ReminderPromptRow): ReminderPromptEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    workedOffsetSeconds: row.worked_offset_seconds,
    status: row.status,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

export class ReminderPromptRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(prompt: ReminderPromptEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO reminder_prompts (
            id,
            session_id,
            worked_offset_seconds,
            status,
            snoozed_until,
            created_at,
            updated_at,
            resolved_at
          ) VALUES (
            @id,
            @sessionId,
            @workedOffsetSeconds,
            @status,
            @snoozedUntil,
            @createdAt,
            @updatedAt,
            @resolvedAt
          )
        `
      )
      .run(prompt);
  }

  public update(prompt: ReminderPromptEntity): void {
    this.db
      .prepare(
        `
          UPDATE reminder_prompts
          SET
            session_id = @sessionId,
            worked_offset_seconds = @workedOffsetSeconds,
            status = @status,
            snoozed_until = @snoozedUntil,
            created_at = @createdAt,
            updated_at = @updatedAt,
            resolved_at = @resolvedAt
          WHERE id = @id
        `
      )
      .run(prompt);
  }

  public findById(id: string): ReminderPromptEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            worked_offset_seconds,
            status,
            snoozed_until,
            created_at,
            updated_at,
            resolved_at
          FROM reminder_prompts
          WHERE id = ?
        `
      )
      .get(id) as ReminderPromptRow | undefined;

    return row ? mapReminderPromptRow(row) : null;
  }

  public findLatestPendingBySessionId(sessionId: string): ReminderPromptEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            worked_offset_seconds,
            status,
            snoozed_until,
            created_at,
            updated_at,
            resolved_at
          FROM reminder_prompts
          WHERE session_id = ? AND status IN ('pending','snoozed')
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(sessionId) as ReminderPromptRow | undefined;

    return row ? mapReminderPromptRow(row) : null;
  }

  public findLatestActivePrompt(): ReminderPromptEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            session_id,
            worked_offset_seconds,
            status,
            snoozed_until,
            created_at,
            updated_at,
            resolved_at
          FROM reminder_prompts
          WHERE status IN ('pending','snoozed')
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get() as ReminderPromptRow | undefined;

    return row ? mapReminderPromptRow(row) : null;
  }

  public findLatestTriggeredOffset(sessionId: string): number | null {
    const row = this.db
      .prepare(
        `
          SELECT MAX(worked_offset_seconds) AS max_offset
          FROM reminder_prompts
          WHERE session_id = ?
        `
      )
      .get(sessionId) as { max_offset: number | null } | undefined;

    return row?.max_offset ?? null;
  }
}
