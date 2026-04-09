export const migration001Init = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_work_seconds INTEGER NOT NULL DEFAULT 7200,
  worked_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft','active','paused','completed','exported','crashed')),
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

CREATE TABLE IF NOT EXISTS work_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('active','paused')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  worked_seconds INTEGER NOT NULL DEFAULT 0,
  close_reason TEXT CHECK (close_reason IN ('pause','complete','suspend','app_exit','crash_recovery')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  worked_offset_seconds INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('shell','completed','abandoned')),
  note_text TEXT,
  reminder_triggered INTEGER NOT NULL DEFAULT 1,
  manual_checkpoint INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screenshot_assets (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  capture_mode TEXT NOT NULL DEFAULT 'full_desktop',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('voice_over')),
  file_path TEXT NOT NULL,
  duration_ms INTEGER,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('imported_appendix','export')),
  file_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  active_segment_id TEXT,
  worked_seconds_cached INTEGER NOT NULL DEFAULT 0,
  pending_checkpoint_payload_json TEXT,
  pending_export_payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_segments_session_id ON work_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session_id ON checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_checkpoint_id ON screenshot_assets(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_audio_session_id ON audio_assets(session_id);
CREATE INDEX IF NOT EXISTS idx_video_session_id ON video_assets(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session_id ON app_state_snapshots(session_id);
`;

