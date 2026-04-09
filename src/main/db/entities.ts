import type { ScreenshotMode, SessionStatus, WorkSegmentType } from "../../shared/contracts";

export type SessionEntity = {
  id: string;
  title: string;
  targetWorkSeconds: number;
  workedSeconds: number;
  status: SessionStatus;
  reminderIntervalMinutes: number;
  screenshotMode: ScreenshotMode;
  allowOvertime: boolean;
  overtimeStartedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkSegmentCloseReason =
  | "pause"
  | "complete"
  | "suspend"
  | "app_exit"
  | "crash_recovery"
  | "cancel"
  | null;

export type WorkSegmentEntity = {
  id: string;
  sessionId: string;
  type: WorkSegmentType;
  startedAt: string;
  endedAt: string | null;
  workedSeconds: number;
  closeReason: WorkSegmentCloseReason;
  createdAt: string;
};

export type AppStateSnapshotEntity = {
  id: string;
  sessionId: string;
  recordedAt: string;
  activeSegmentId: string | null;
  workedSecondsCached: number;
  pendingCheckpointPayloadJson: string | null;
  pendingExportPayloadJson: string | null;
};

export type CheckpointEntity = {
  id: string;
  sessionId: string;
  occurredAt: string;
  workedOffsetSeconds: number;
  status: "shell" | "completed" | "abandoned";
  noteText: string | null;
  reminderTriggered: boolean;
  manualCheckpoint: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScreenshotAssetEntity = {
  id: string;
  checkpointId: string;
  filePath: string;
  width: number | null;
  height: number | null;
  captureMode: ScreenshotMode;
  createdAt: string;
};

export type AudioAssetEntity = {
  id: string;
  sessionId: string;
  type: "voice_over";
  filePath: string;
  durationMs: number | null;
  trimStartMs: number;
  trimEndMs: number | null;
  createdAt: string;
};

export type VideoAssetEntity = {
  id: string;
  sessionId: string;
  type: "imported_appendix" | "export";
  filePath: string;
  durationMs: number | null;
  createdAt: string;
};

export type RuntimeStateEntity = {
  key: string;
  value: string;
  updatedAt: string;
};

export type ReminderPromptEntity = {
  id: string;
  sessionId: string;
  workedOffsetSeconds: number;
  status: "pending" | "snoozed" | "skipped" | "captured";
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type ExportCompositionEntity = {
  sessionId: string;
  voiceOverAssetId: string | null;
  appendixVideoAssetId: string | null;
  outputFilePath: string | null;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
};

export type ExportTimelineSegmentEntity = {
  id: string;
  sessionId: string;
  checkpointId: string;
  startOffsetMs: number;
  endOffsetMs: number;
  sortOrder: number;
  source: "live_marker" | "manual_edit" | "seeded";
  createdAt: string;
  updatedAt: string;
};
