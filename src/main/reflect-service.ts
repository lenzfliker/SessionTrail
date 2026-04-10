import type Database from "better-sqlite3";
import { app, dialog } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReflectQuery, ReflectSummary } from "../shared/contracts";
import type {
  CheckpointEntity,
  ReminderPromptEntity,
  SessionEntity,
  WorkSegmentEntity,
} from "./db/entities";
import { buildReflectSummary, resolveReflectRange } from "./reflect-analytics";

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

type WorkSegmentRow = {
  id: string;
  session_id: string;
  type: WorkSegmentEntity["type"];
  started_at: string;
  ended_at: string | null;
  worked_seconds: number;
  close_reason: WorkSegmentEntity["closeReason"];
  created_at: string;
};

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
    updatedAt: row.updated_at,
  };
}

function mapWorkSegmentRow(row: WorkSegmentRow): WorkSegmentEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    workedSeconds: row.worked_seconds,
    closeReason: row.close_reason,
    createdAt: row.created_at,
  };
}

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
    updatedAt: row.updated_at,
  };
}

function mapReminderPromptRow(row: ReminderPromptRow): ReminderPromptEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    workedOffsetSeconds: row.worked_offset_seconds,
    status: row.status,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function escapeCsv(value: string | number | null): string {
  const normalized = value === null ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDatePart(value: string): string {
  return value.slice(0, 10);
}

function buildReportDefaultPath(summary: ReflectSummary): string {
  const presetLabel = summary.preset === "this_month" ? "month" : "week";
  const startLabel = formatDatePart(summary.rangeStartedAt);
  const endLabel = formatDatePart(summary.rangeEndedAt);
  return join(
    app.getPath("downloads"),
    `SessionTrail-reflect-${presetLabel}-${startLabel}-to-${endLabel}.csv`
  );
}

function buildReportCsv(summary: ReflectSummary): string {
  const lines: string[] = [];
  const pushRow = (...values: Array<string | number | null>) => {
    lines.push(values.map(escapeCsv).join(","));
  };

  pushRow("Report Metadata", null);
  pushRow("Generated At", summary.generatedAt);
  pushRow("Preset", summary.preset);
  pushRow("Range Label", summary.rangeLabel);
  pushRow("Range Started At", summary.rangeStartedAt);
  pushRow("Range Ended At", summary.rangeEndedAt);
  lines.push("");

  pushRow("Summary", null);
  pushRow("Metric", "Value");
  pushRow("Total Sessions", summary.overview.totalSessions);
  pushRow("Completed Sessions", summary.overview.completedSessions);
  pushRow("Canceled Sessions", summary.overview.canceledSessions);
  pushRow("Total Worked", formatDuration(summary.overview.totalWorkedSeconds));
  pushRow("Median Session", formatDuration(summary.overview.medianWorkedSeconds));
  pushRow("Pause Count", summary.fragmentation.totalPauseCount);
  pushRow("Pauses Per Worked Hour", summary.fragmentation.pausesPerWorkedHour);
  pushRow("Median Pause", formatDuration(summary.fragmentation.medianPauseSeconds));
  pushRow("Longest Active Block", formatDuration(summary.fragmentation.longestActiveBlockSeconds));
  pushRow("Average Active Block", formatDuration(summary.fragmentation.averageActiveBlockSeconds));
  pushRow("Reminder Prompts", summary.checkpoints.reminderTriggeredCount);
  pushRow("Reminder Captured", summary.checkpoints.reminderCapturedCount);
  pushRow("Manual Checkpoints", summary.checkpoints.manualCheckpointCount);
  pushRow("Completed Checkpoints", summary.checkpoints.completedCheckpointCount);
  pushRow("Abandoned Checkpoints", summary.checkpoints.abandonedCheckpointCount);
  lines.push("");

  pushRow("Daily Totals", null);
  pushRow("Day", "Active Worked", "Session Starts");
  for (const weekday of summary.rhythms.weekdays) {
    pushRow(weekday.label, formatDuration(weekday.activeSeconds), weekday.sessionStarts);
  }
  lines.push("");

  pushRow("Sessions", null);
  pushRow(
    "Title",
    "Status",
    "Started At",
    "Ended At",
    "Worked",
    "Paused",
    "Pause Count",
    "Longest Active Block",
    "Average Active Block",
    "Reminder Prompts",
    "Manual Checkpoints",
    "Completed Checkpoints",
    "Abandoned Checkpoints",
    "Interruption Flags"
  );
  for (const session of summary.sessions) {
    pushRow(
      session.title,
      session.status,
      session.startedAt,
      session.endedAt,
      formatDuration(session.workedSeconds),
      formatDuration(session.pausedSeconds),
      session.pauseCount,
      formatDuration(session.longestActiveBlockSeconds),
      formatDuration(session.averageActiveBlockSeconds),
      session.reminderTriggeredCount,
      session.manualCheckpointCount,
      session.completedCheckpointCount,
      session.abandonedCheckpointCount,
      session.interruptionReasons.join(" | ")
    );
  }

  return lines.join("\r\n");
}

export class ReflectService {
  public constructor(private readonly db: Database.Database) {}

  public getSummary(query?: ReflectQuery): ReflectSummary {
    const range = resolveReflectRange(query);
    const sessions = this.db
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
          WHERE started_at IS NOT NULL
            AND started_at >= ?
            AND started_at <= ?
          ORDER BY started_at DESC
        `
      )
      .all(range.startedAt.toISOString(), range.endedAt.toISOString()) as SessionRow[];

    const sessionEntities = sessions.map(mapSessionRow);
    const sessionIds = sessionEntities.map((session) => session.id);

    const workSegments = sessionIds.length > 0
      ? (this.db
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
              WHERE session_id IN (${placeholders(sessionIds.length)})
              ORDER BY started_at ASC
            `
          )
          .all(...sessionIds) as WorkSegmentRow[]).map(mapWorkSegmentRow)
      : [];

    const checkpoints = sessionIds.length > 0
      ? (this.db
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
              WHERE session_id IN (${placeholders(sessionIds.length)})
              ORDER BY occurred_at ASC
            `
          )
          .all(...sessionIds) as CheckpointRow[]).map(mapCheckpointRow)
      : [];

    const reminderPrompts = sessionIds.length > 0
      ? (this.db
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
              WHERE session_id IN (${placeholders(sessionIds.length)})
              ORDER BY created_at ASC
            `
          )
          .all(...sessionIds) as ReminderPromptRow[]).map(mapReminderPromptRow)
      : [];

    return buildReflectSummary(
      {
        sessions: sessionEntities,
        workSegments,
        checkpoints,
        reminderPrompts,
      },
      query,
      range.endedAt
    );
  }

  public async exportReport(query?: ReflectQuery): Promise<string | null> {
    const summary = this.getSummary(query);
    const result = await dialog.showSaveDialog({
      title: "Export reflect report",
      defaultPath: buildReportDefaultPath(summary),
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const outputFilePath = result.filePath.toLowerCase().endsWith(".csv")
      ? result.filePath
      : `${result.filePath}.csv`;

    writeFileSync(outputFilePath, buildReportCsv(summary), "utf8");
    return outputFilePath;
  }
}
