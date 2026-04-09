# SessionTrail - IPC Contract

## Principles

- preload exposes the only renderer API
- renderer never touches SQLite directly
- renderer never owns canonical session timing, recovery state, or export state
- main process emits authoritative app state

## Renderer to Main

### `app`

- `app.getState()`
- `app.showDashboard()`
- `app.hideDashboard()`
- `app.toggleDashboard()`
- `app.clearLastError()`
- `app.quit()`

### `settings`

- `settings.get()`
- `settings.set({ reminderIntervalMinutes?, launchAtLogin? })`

### `session`

- `session.start({ title? })`
- `session.pause(sessionId?)`
- `session.resume(sessionId?)`
- `session.complete(sessionId?)`
- `session.cancel(sessionId?)`
- `session.rename({ sessionId, title })`
- `session.delete(sessionId?)`
- `session.getActive()`
- `session.listHistory({ query?, status?, limit, offset })`
- `session.getById(sessionId)`
- `session.listRecent()`

### `reminder`

- `reminder.getPendingPrompt()`
- `reminder.takeScreenshot(reminderPromptId)`
- `reminder.skip(reminderPromptId)`
- `reminder.snooze(reminderPromptId)`

### `checkpoint`

- `checkpoint.createManual(sessionId)`
- `checkpoint.finalize({ checkpointId, noteText })`
- `checkpoint.updateNote({ checkpointId, noteText })`
- `checkpoint.listForSession(sessionId)`

### `audio`

- `audio.saveRecording({ sessionId, mimeType, buffer })`
- `audio.getLatestVoiceOver(sessionId)`
- `audio.preparePreview(audioAssetId)`

### `video`

- `video.importAppendix(sessionId)`
- `video.getById(videoAssetId)`
- `video.getLatestAppendix(sessionId)`

### `export`

- `export.run({ sessionId, voiceOverAssetId?, appendixVideoAssetId? })`
- `export.getActiveJob()`
- `export.getComposition(sessionId)`
- `export.saveComposition({ sessionId, voiceOverAssetId?, appendixVideoAssetId?, durationMs?, segments[] })`
- `export.chooseOutputPath(sessionId)`

### `recovery`

- `recovery.getPending()`
- `recovery.resume(sessionId?)`
- `recovery.leavePaused(sessionId?)`
- `recovery.endNow(sessionId?)`

## Main to Renderer

- `app:state-changed`
- `session:updated`

Separate export-progress or error events are not required in v1 because the main process folds `activeExportJob`, `settings`, and `lastErrorMessage` into app state.

## Key Types

```ts
type AppSettings = {
  reminderIntervalMinutes: number;
  launchAtLogin: boolean;
  theme: "clean";
};

type ExportJobSummary = {
  id: string;
  sessionId: string;
  status: "idle" | "running" | "completed" | "failed";
  progressRatio: number;
  message: string;
  outputFilePath: string | null;
  startedAt: string;
  updatedAt: string;
  errorMessage: string | null;
};

type AppState = {
  activeSession: SessionSummary | null;
  recentSessions: SessionSummary[];
  pendingRecovery: RecoverySessionSummary | null;
  pendingReminderPrompt: ReminderPromptSummary | null;
  pendingCheckpoint: PendingCheckpoint | null;
  activeExportJob: ExportJobSummary | null;
  settings: AppSettings;
  lastErrorMessage: string | null;
  status: "booting" | "ready" | "error";
  trayReady: boolean;
  dashboardVisibility: "visible" | "hidden";
};
```

`ExportCompositionSummary` now also carries `outputFilePath`, which is the current draft destination for the final MP4.
