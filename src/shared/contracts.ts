export type AppStatus = "booting" | "ready" | "error";
export type DashboardVisibility = "visible" | "hidden";
export type SessionStatus = "draft" | "active" | "paused" | "completed" | "exported" | "crashed" | "canceled";
export type WorkSegmentType = "active" | "paused";
export type ScreenshotMode = "full_desktop";
export type AudioAssetType = "voice_over";
export type VideoAssetType = "imported_appendix" | "export";
export type ExportJobStatus = "idle" | "running" | "completed" | "failed";
export type MediaImportKind = "appendix";
export type MediaImportJobStatus = "running" | "completed" | "failed";
export type ThemeMode = "clean";
export type ReminderPromptStatus = "pending" | "snoozed";
export type ExportTimelineSegmentSource = "live_marker" | "manual_edit" | "seeded";
export type StartupDashboardBehavior = "tray_only" | "show_dashboard";

export type SessionSummary = {
  id: string;
  title: string;
  status: SessionStatus;
  workedSeconds: number;
  targetWorkSeconds: number;
  reminderIntervalMinutes: number;
  screenshotMode: ScreenshotMode;
  allowOvertime: boolean;
  overtimeStartedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  currentSegmentId: string | null;
  currentSegmentType: WorkSegmentType | null;
  currentSegmentStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecoverySessionSummary = {
  session: SessionSummary;
  reason: "unclean_shutdown";
  recoveredAt: string;
  shellCheckpointCount: number;
};

export type ScreenshotAssetSummary = {
  id: string;
  checkpointId: string;
  filePath: string;
  width: number | null;
  height: number | null;
  captureMode: ScreenshotMode;
  createdAt: string;
};

export type CheckpointSummary = {
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
  screenshot: ScreenshotAssetSummary | null;
};

export type PendingCheckpoint = {
  checkpoint: CheckpointSummary;
  screenshotDataUrl: string;
  modalOpenedAt: string;
};

export type ReminderPromptSummary = {
  id: string;
  sessionId: string;
  workedOffsetSeconds: number;
  status: ReminderPromptStatus;
  createdAt: string;
  snoozedUntil: string | null;
};

export type AppSettings = {
  reminderIntervalMinutes: number;
  defaultTargetMinutes: number;
  launchAtLogin: boolean;
  captureDelaySeconds: number;
  reminderSnoozeMinutes: number;
  startupDashboardBehavior: StartupDashboardBehavior;
  openDashboardOnReminder: boolean;
  defaultExportDirectory: string;
  uiSoundsEnabled: boolean;
  uiMotionEnabled: boolean;
  theme: ThemeMode;
};

export type ResumeNotice = {
  sessionId: string;
  reason: "suspend";
  message: string;
  resumedAt: string;
};

export type AppState = {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  bootedAt: string;
  status: AppStatus;
  trayReady: boolean;
  dashboardVisibility: DashboardVisibility;
  activeSession: SessionSummary | null;
  recentSessions: SessionSummary[];
  pendingRecovery: RecoverySessionSummary | null;
  pendingReminderPrompt: ReminderPromptSummary | null;
  pendingCheckpoint: PendingCheckpoint | null;
  activeExportJob: ExportJobSummary | null;
  activeMediaImportJob: MediaImportJobSummary | null;
  resumeNotice: ResumeNotice | null;
  settings: AppSettings;
  lastErrorMessage: string | null;
};

export type StartSessionInput = {
  title?: string;
};

export type FinalizeCheckpointInput = {
  checkpointId: string;
  noteText: string;
};

export type UpdateCheckpointNoteInput = {
  checkpointId: string;
  noteText: string;
};

export type SaveRecordedVoiceOverInput = {
  sessionId: string;
  mimeType: string;
  buffer: ArrayBuffer;
};

export type RenameSessionInput = {
  sessionId: string;
  title: string;
};

export type SaveAudioTrimInput = {
  audioAssetId: string;
  trimStartMs: number;
  trimEndMs: number;
};

export type ExportTimelineSegmentSummary = {
  id: string;
  sessionId: string;
  checkpointId: string;
  startOffsetMs: number;
  endOffsetMs: number;
  sortOrder: number;
  source: ExportTimelineSegmentSource;
  createdAt: string;
  updatedAt: string;
};

export type ExportCompositionSummary = {
  sessionId: string;
  voiceOverAssetId: string | null;
  appendixVideoAssetId: string | null;
  outputFilePath: string | null;
  durationMs: number;
  segments: ExportTimelineSegmentSummary[];
  updatedAt: string;
  createdAt: string;
};

export type ExportRunInput = {
  sessionId: string;
  voiceOverAssetId?: string;
  appendixVideoAssetId?: string;
};

export type SaveExportCompositionInput = {
  sessionId: string;
  voiceOverAssetId?: string | null;
  appendixVideoAssetId?: string | null;
  outputFilePath?: string | null;
  durationMs?: number | null;
  segments: Array<{
    id?: string;
    checkpointId: string;
    startOffsetMs: number;
    endOffsetMs: number;
    sortOrder: number;
    source: ExportTimelineSegmentSource;
  }>;
};

export type UpdateSettingsInput = Partial<
  Pick<
    AppSettings,
    | "reminderIntervalMinutes"
    | "defaultTargetMinutes"
    | "launchAtLogin"
    | "captureDelaySeconds"
    | "reminderSnoozeMinutes"
    | "startupDashboardBehavior"
    | "openDashboardOnReminder"
    | "defaultExportDirectory"
    | "uiSoundsEnabled"
    | "uiMotionEnabled"
  >
>;

export type SessionCancelResult = {
  outcome: "kept" | "deleted" | "dismissed";
  session: SessionSummary | null;
};

export type TimelineCheckpointSummary = CheckpointSummary & {
  thumbnailDataUrl: string | null;
};

export type SessionHistoryStatusFilter = SessionStatus | "all";

export type SessionHistoryQuery = {
  query?: string;
  status?: SessionHistoryStatusFilter;
  limit?: number;
  offset?: number;
};

export type SessionHistoryPage = {
  items: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type ReflectRangePreset = "this_week" | "this_month";
export type ReflectDayPartKey = "overnight" | "morning" | "afternoon" | "evening";
export type ReflectInterruptionReason = "suspend" | "app_exit" | "crash_recovery";

export type ReflectQuery = {
  preset?: ReflectRangePreset;
};

export type ReflectOverviewSummary = {
  totalSessions: number;
  completedSessions: number;
  canceledSessions: number;
  totalWorkedSeconds: number;
  medianWorkedSeconds: number;
};

export type ReflectHourSummary = {
  hour: number;
  label: string;
  sessionStarts: number;
};

export type ReflectWeekdaySummary = {
  weekday: number;
  label: string;
  sessionStarts: number;
  activeSeconds: number;
};

export type ReflectHeatmapCellSummary = {
  weekday: number;
  weekdayLabel: string;
  hour: number;
  hourLabel: string;
  activeSeconds: number;
};

export type ReflectDayPartSummary = {
  dayPart: ReflectDayPartKey;
  label: string;
  activeSeconds: number;
};

export type ReflectFragmentationSummary = {
  totalPauseCount: number;
  pausesPerWorkedHour: number;
  medianPauseSeconds: number;
  longestActiveBlockSeconds: number;
  averageActiveBlockSeconds: number;
};

export type ReflectInterruptionSummary = {
  suspendCount: number;
  appExitCount: number;
  crashRecoveryCount: number;
  affectedSessionCount: number;
};

export type ReflectCheckpointMetricsSummary = {
  reminderTriggeredCount: number;
  reminderSnoozedCount: number;
  reminderSkippedCount: number;
  reminderCapturedCount: number;
  manualCheckpointCount: number;
  completedCheckpointCount: number;
  abandonedCheckpointCount: number;
};

export type ReflectSessionDetail = {
  sessionId: string;
  title: string;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  workedSeconds: number;
  pausedSeconds: number;
  pauseCount: number;
  longestActiveBlockSeconds: number;
  averageActiveBlockSeconds: number;
  interruptionReasons: ReflectInterruptionReason[];
  reminderTriggeredCount: number;
  manualCheckpointCount: number;
  completedCheckpointCount: number;
  abandonedCheckpointCount: number;
};

export type ReflectSummary = {
  preset: ReflectRangePreset;
  rangeLabel: string;
  rangeStartedAt: string;
  rangeEndedAt: string;
  generatedAt: string;
  overview: ReflectOverviewSummary;
  rhythms: {
    startHours: ReflectHourSummary[];
    weekdays: ReflectWeekdaySummary[];
    heatmap: ReflectHeatmapCellSummary[];
    dayParts: ReflectDayPartSummary[];
  };
  fragmentation: ReflectFragmentationSummary;
  interruptions: ReflectInterruptionSummary;
  checkpoints: ReflectCheckpointMetricsSummary;
  sessions: ReflectSessionDetail[];
};

export type AudioAssetSummary = {
  id: string;
  sessionId: string;
  type: AudioAssetType;
  filePath: string;
  durationMs: number | null;
  trimStartMs: number;
  trimEndMs: number | null;
  createdAt: string;
};

export type VideoAssetSummary = {
  id: string;
  sessionId: string;
  type: VideoAssetType;
  filePath: string;
  durationMs: number | null;
  createdAt: string;
};

export type ExportJobSummary = {
  id: string;
  sessionId: string;
  status: ExportJobStatus;
  progressRatio: number;
  message: string;
  outputFilePath: string | null;
  startedAt: string;
  updatedAt: string;
  errorMessage: string | null;
};

export type MediaImportJobSummary = {
  id: string;
  sessionId: string;
  mediaKind: MediaImportKind;
  status: MediaImportJobStatus;
  progressRatio: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  errorMessage: string | null;
};

export type PreparedAudioPreview = {
  mimeType: string;
  buffer: ArrayBuffer;
};

export type SessionTrailApi = {
  app: {
    getState: () => Promise<AppState>;
    showDashboard: () => Promise<AppState>;
    hideDashboard: () => Promise<AppState>;
    toggleDashboard: () => Promise<AppState>;
    clearLastError: () => Promise<AppState>;
    dismissResumeNotice: () => Promise<AppState>;
    quit: () => Promise<void>;
    onStateChanged: (listener: (state: AppState) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (input: UpdateSettingsInput) => Promise<AppSettings>;
  };
  session: {
    start: (input?: StartSessionInput) => Promise<SessionSummary>;
    pause: (sessionId?: string) => Promise<SessionSummary>;
    resume: (sessionId?: string) => Promise<SessionSummary>;
    complete: (sessionId?: string) => Promise<SessionSummary>;
    cancel: (sessionId?: string) => Promise<SessionCancelResult>;
    delete: (sessionId?: string) => Promise<SessionCancelResult>;
    rename: (input: RenameSessionInput) => Promise<SessionSummary>;
    getActive: () => Promise<SessionSummary | null>;
    getById: (sessionId: string) => Promise<SessionSummary | null>;
    listRecent: () => Promise<SessionSummary[]>;
    listHistory: (query?: SessionHistoryQuery) => Promise<SessionHistoryPage>;
    onUpdated: (listener: (session: SessionSummary | null) => void) => () => void;
  };
  reflect: {
    getSummary: (query?: ReflectQuery) => Promise<ReflectSummary>;
  };
  reminder: {
    getPendingPrompt: () => Promise<ReminderPromptSummary | null>;
    takeScreenshot: (reminderPromptId: string) => Promise<PendingCheckpoint>;
    skip: (reminderPromptId: string) => Promise<ReminderPromptSummary | null>;
    snooze: (reminderPromptId: string) => Promise<ReminderPromptSummary>;
  };
  recovery: {
    getPending: () => Promise<RecoverySessionSummary | null>;
    resume: (sessionId?: string) => Promise<SessionSummary>;
    leavePaused: (sessionId?: string) => Promise<SessionSummary | null>;
    endNow: (sessionId?: string) => Promise<SessionSummary>;
  };
  checkpoint: {
    createManual: (sessionId: string) => Promise<PendingCheckpoint>;
    finalize: (input: FinalizeCheckpointInput) => Promise<CheckpointSummary>;
    updateNote: (input: UpdateCheckpointNoteInput) => Promise<CheckpointSummary>;
    listForSession: (sessionId: string) => Promise<TimelineCheckpointSummary[]>;
    getScreenshotPreview: (checkpointId: string) => Promise<string | null>;
  };
  audio: {
    saveRecording: (input: SaveRecordedVoiceOverInput) => Promise<AudioAssetSummary>;
    getLatestVoiceOver: (sessionId: string) => Promise<AudioAssetSummary | null>;
    preparePreview: (audioAssetId: string) => Promise<string>;
    getPreparedPreview: (audioAssetId: string) => Promise<PreparedAudioPreview>;
  };
  video: {
    importAppendix: (sessionId: string) => Promise<VideoAssetSummary | null>;
    getById: (videoAssetId: string) => Promise<VideoAssetSummary | null>;
    getLatestAppendix: (sessionId: string) => Promise<VideoAssetSummary | null>;
  };
  export: {
    run: (input: ExportRunInput) => Promise<ExportJobSummary>;
    cancel: () => Promise<ExportJobSummary | null>;
    getActiveJob: () => Promise<ExportJobSummary | null>;
    getComposition: (sessionId: string) => Promise<ExportCompositionSummary>;
    saveComposition: (input: SaveExportCompositionInput) => Promise<ExportCompositionSummary>;
    chooseOutputPath: (sessionId: string) => Promise<ExportCompositionSummary>;
    revealOutput: (sessionId: string) => Promise<boolean>;
    openOutput: (sessionId: string) => Promise<boolean>;
  };
};
