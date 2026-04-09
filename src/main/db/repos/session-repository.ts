import type Database from "better-sqlite3";
import type { SessionEntity } from "../entities";
import type { SessionHistoryQuery } from "../../../shared/contracts";

type SessionRow = {
  id: string;
  title: string;
  target_work_seconds: number;
  worked_seconds: number;
  status: SessionEntity["status"];
  reminder_interval_minutes: number;
  screenshot_mode: SessionEntity["screenshotMode"];
  allow_overtime: number;
  overtime_started_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapSessionRow(row: SessionRow): SessionEntity {
  return {
    id: row.id,
    title: row.title,
    targetWorkSeconds: row.target_work_seconds,
    workedSeconds: row.worked_seconds,
    status: row.status,
    reminderIntervalMinutes: row.reminder_interval_minutes,
    screenshotMode: row.screenshot_mode,
    allowOvertime: row.allow_overtime === 1,
    overtimeStartedAt: row.overtime_started_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SessionRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(session: SessionEntity): void {
    this.db
      .prepare(
        `
          INSERT INTO sessions (
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          ) VALUES (
            @id,
            @title,
            @targetWorkSeconds,
            @workedSeconds,
            @status,
            @reminderIntervalMinutes,
            @screenshotMode,
            @allowOvertime,
            @overtimeStartedAt,
            @startedAt,
            @endedAt,
            @lastHeartbeatAt,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        ...session,
        allowOvertime: session.allowOvertime ? 1 : 0
      });
  }

  public update(session: SessionEntity): void {
    this.db
      .prepare(
        `
          UPDATE sessions
          SET
            title = @title,
            target_work_seconds = @targetWorkSeconds,
            worked_seconds = @workedSeconds,
            status = @status,
            reminder_interval_minutes = @reminderIntervalMinutes,
            screenshot_mode = @screenshotMode,
            allow_overtime = @allowOvertime,
            overtime_started_at = @overtimeStartedAt,
            started_at = @startedAt,
            ended_at = @endedAt,
            last_heartbeat_at = @lastHeartbeatAt,
            created_at = @createdAt,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run({
        ...session,
        allowOvertime: session.allowOvertime ? 1 : 0
      });
  }

  public renameById(sessionId: string, title: string): void {
    this.db
      .prepare(
        `
          UPDATE sessions
          SET title = ?
          WHERE id = ?
        `
      )
      .run(title, sessionId);
  }

  public findById(id: string): SessionEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          FROM sessions
          WHERE id = ?
        `
      )
      .get(id) as SessionRow | undefined;

    return row ? mapSessionRow(row) : null;
  }

  public findLatestOpenSession(): SessionEntity | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          FROM sessions
          WHERE status IN ('active', 'paused')
          ORDER BY updated_at DESC
          LIMIT 1
        `
      )
      .get() as SessionRow | undefined;

    return row ? mapSessionRow(row) : null;
  }

  public listByStatus(status: SessionEntity["status"]): SessionEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          FROM sessions
          WHERE status = ?
          ORDER BY updated_at DESC
        `
      )
      .all(status) as SessionRow[];

    return rows.map(mapSessionRow);
  }

  public listRecent(limit = 6): SessionEntity[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          FROM sessions
          ORDER BY updated_at DESC
          LIMIT ?
        `
      )
      .all(limit) as SessionRow[];

    return rows.map(mapSessionRow);
  }

  public listHistory(query: SessionHistoryQuery): SessionEntity[] {
    const params: Array<string | number> = [];
    const whereClauses: string[] = [];

    if (query.status && query.status !== "all") {
      whereClauses.push("status = ?");
      params.push(query.status);
    }

    if (query.query?.trim()) {
      whereClauses.push("LOWER(title) LIKE ?");
      params.push(`%${query.query.trim().toLowerCase()}%`);
    }

    params.push(query.limit ?? 20, query.offset ?? 0);
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            target_work_seconds,
            worked_seconds,
            status,
            reminder_interval_minutes,
            screenshot_mode,
            allow_overtime,
            overtime_started_at,
            started_at,
            ended_at,
            last_heartbeat_at,
            created_at,
            updated_at
          FROM sessions
          ${whereSql}
          ORDER BY updated_at DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .all(...params) as SessionRow[];

    return rows.map(mapSessionRow);
  }

  public countHistory(query: SessionHistoryQuery): number {
    const params: string[] = [];
    const whereClauses: string[] = [];

    if (query.status && query.status !== "all") {
      whereClauses.push("status = ?");
      params.push(query.status);
    }

    if (query.query?.trim()) {
      whereClauses.push("LOWER(title) LIKE ?");
      params.push(`%${query.query.trim().toLowerCase()}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM sessions ${whereSql}`)
      .get(...params) as { count: number } | undefined;

    return row?.count ?? 0;
  }

  public deleteById(sessionId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
}
