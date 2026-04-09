export const migration003V2InteractionExport = `
ALTER TABLE sessions RENAME TO sessions_old;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_work_seconds INTEGER NOT NULL DEFAULT 7200,
  worked_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft','active','paused','completed','exported','crashed','canceled')),
  reminder_interval_minutes INTEGER NOT NULL DEFAULT 10,
  screenshot_mode TEXT NOT NULL DEFAULT 'full_desktop',
  allow_overtime INTEGER NOT NULL DEFAULT 1,
  overtime_started_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  last_heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
)
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
FROM sessions_old;

DROP TABLE sessions_old;

ALTER TABLE work_segments RENAME TO work_segments_old;

CREATE TABLE work_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('active','paused')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  worked_seconds INTEGER NOT NULL DEFAULT 0,
  close_reason TEXT CHECK (close_reason IN ('pause','complete','suspend','app_exit','crash_recovery','cancel')),
  created_at TEXT NOT NULL
);

INSERT INTO work_segments (
  id,
  session_id,
  type,
  started_at,
  ended_at,
  worked_seconds,
  close_reason,
  created_at
)
SELECT
  id,
  session_id,
  type,
  started_at,
  ended_at,
  worked_seconds,
  close_reason,
  created_at
FROM work_segments_old;

DROP TABLE work_segments_old;

CREATE TABLE IF NOT EXISTS reminder_prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  worked_offset_seconds INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','snoozed','skipped','captured')),
  snoozed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS export_compositions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  voice_over_asset_id TEXT REFERENCES audio_assets(id) ON DELETE SET NULL,
  appendix_video_asset_id TEXT REFERENCES video_assets(id) ON DELETE SET NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_timeline_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  start_offset_ms INTEGER NOT NULL,
  end_offset_ms INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live_marker','manual_edit','seeded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_prompts_session_id ON reminder_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_export_segments_session_id ON export_timeline_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_export_segments_checkpoint_id ON export_timeline_segments(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_segments_session_id ON work_segments(session_id);
`;
