export const migration007ImportedMediaVisualSources = `
CREATE TABLE imported_media_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  file_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

INSERT INTO imported_media_assets (
  id,
  session_id,
  kind,
  file_path,
  duration_ms,
  created_at
)
SELECT
  id,
  session_id,
  'video',
  file_path,
  duration_ms,
  created_at
FROM video_assets
WHERE type = 'imported_appendix';

ALTER TABLE export_timeline_segments RENAME TO export_timeline_segments_old_visuals;

CREATE TABLE export_timeline_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('checkpoint','imported_image','imported_video')),
  source_id TEXT NOT NULL,
  start_offset_ms INTEGER NOT NULL,
  end_offset_ms INTEGER NOT NULL,
  media_start_offset_ms INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live_marker','manual_edit','seeded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO export_timeline_segments (
  id,
  session_id,
  source_kind,
  source_id,
  start_offset_ms,
  end_offset_ms,
  media_start_offset_ms,
  sort_order,
  source,
  created_at,
  updated_at
)
SELECT
  id,
  session_id,
  'checkpoint',
  checkpoint_id,
  start_offset_ms,
  end_offset_ms,
  0,
  sort_order,
  source,
  created_at,
  updated_at
FROM export_timeline_segments_old_visuals;

DROP TABLE export_timeline_segments_old_visuals;

CREATE INDEX idx_imported_media_assets_session_id ON imported_media_assets(session_id);
CREATE INDEX idx_export_segments_session_id ON export_timeline_segments(session_id);
CREATE INDEX idx_export_segments_source_kind_id ON export_timeline_segments(source_kind, source_id);
`;
