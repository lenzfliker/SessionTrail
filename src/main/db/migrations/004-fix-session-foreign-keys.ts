export const migration004FixSessionForeignKeys = `
PRAGMA foreign_keys = OFF;

ALTER TABLE app_state_snapshots RENAME TO app_state_snapshots_old_fix;
ALTER TABLE audio_assets RENAME TO audio_assets_old_fix;
ALTER TABLE checkpoints RENAME TO checkpoints_old_fix;
ALTER TABLE screenshot_assets RENAME TO screenshot_assets_old_fix;
ALTER TABLE video_assets RENAME TO video_assets_old_fix;
ALTER TABLE export_compositions RENAME TO export_compositions_old_fix;
ALTER TABLE export_timeline_segments RENAME TO export_timeline_segments_old_fix;

CREATE TABLE app_state_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  active_segment_id TEXT,
  worked_seconds_cached INTEGER NOT NULL DEFAULT 0,
  pending_checkpoint_payload_json TEXT,
  pending_export_payload_json TEXT
);

INSERT INTO app_state_snapshots (
  id,
  session_id,
  recorded_at,
  active_segment_id,
  worked_seconds_cached,
  pending_checkpoint_payload_json,
  pending_export_payload_json
)
SELECT
  id,
  session_id,
  recorded_at,
  active_segment_id,
  worked_seconds_cached,
  pending_checkpoint_payload_json,
  pending_export_payload_json
FROM app_state_snapshots_old_fix;

CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('voice_over')),
  file_path TEXT NOT NULL,
  duration_ms INTEGER,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER,
  created_at TEXT NOT NULL
);

INSERT INTO audio_assets (
  id,
  session_id,
  type,
  file_path,
  duration_ms,
  trim_start_ms,
  trim_end_ms,
  created_at
)
SELECT
  id,
  session_id,
  type,
  file_path,
  duration_ms,
  trim_start_ms,
  trim_end_ms,
  created_at
FROM audio_assets_old_fix;

CREATE TABLE checkpoints (
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
)
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
FROM checkpoints_old_fix;

CREATE TABLE screenshot_assets (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  capture_mode TEXT NOT NULL DEFAULT 'full_desktop',
  created_at TEXT NOT NULL
);

INSERT INTO screenshot_assets (
  id,
  checkpoint_id,
  file_path,
  width,
  height,
  capture_mode,
  created_at
)
SELECT
  id,
  checkpoint_id,
  file_path,
  width,
  height,
  capture_mode,
  created_at
FROM screenshot_assets_old_fix;

CREATE TABLE video_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('imported_appendix','export')),
  file_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

INSERT INTO video_assets (
  id,
  session_id,
  type,
  file_path,
  duration_ms,
  created_at
)
SELECT
  id,
  session_id,
  type,
  file_path,
  duration_ms,
  created_at
FROM video_assets_old_fix;

CREATE TABLE export_compositions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  voice_over_asset_id TEXT REFERENCES audio_assets(id) ON DELETE SET NULL,
  appendix_video_asset_id TEXT REFERENCES video_assets(id) ON DELETE SET NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO export_compositions (
  session_id,
  voice_over_asset_id,
  appendix_video_asset_id,
  duration_ms,
  created_at,
  updated_at
)
SELECT
  session_id,
  voice_over_asset_id,
  appendix_video_asset_id,
  duration_ms,
  created_at,
  updated_at
FROM export_compositions_old_fix;

CREATE TABLE export_timeline_segments (
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
)
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
FROM export_timeline_segments_old_fix;

DROP TABLE export_timeline_segments_old_fix;
DROP TABLE export_compositions_old_fix;
DROP TABLE video_assets_old_fix;
DROP TABLE screenshot_assets_old_fix;
DROP TABLE checkpoints_old_fix;
DROP TABLE audio_assets_old_fix;
DROP TABLE app_state_snapshots_old_fix;

CREATE INDEX IF NOT EXISTS idx_checkpoints_session_id ON checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_checkpoint_id ON screenshot_assets(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_audio_session_id ON audio_assets(session_id);
CREATE INDEX IF NOT EXISTS idx_video_session_id ON video_assets(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session_id ON app_state_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_export_segments_session_id ON export_timeline_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_export_segments_checkpoint_id ON export_timeline_segments(checkpoint_id);

PRAGMA foreign_keys = ON;
`;
