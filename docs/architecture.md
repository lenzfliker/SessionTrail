# SessionTrail - Architecture

## High-level structure

```text
Electron Main Process
  |- app lifecycle and single-instance boot
  |- tray menu and dashboard window control
  |- SQLite repositories and migrations
  |- session state machine and heartbeat persistence
  |- startup recovery reconciliation
  |- worked-time reminder scheduling
  |- desktop screenshot capture
  |- settings persistence via electron-store
  |- voice-over recording and media import persistence
  |- FFmpeg export orchestration
  `- file logging and error capture

Preload
  `- secure typed IPC bridge

Renderer
  |- dashboard
  |- settings panel
  |- recovery dialog
  |- reminder overlay
  |- checkpoint note inspector
  |- timeline editor
  `- export screen
```

## Architectural rule

The main process is the source of truth.

Critical session state, reminder scheduling, recovery state, checkpoint durability, settings, and export progress all live in the main process and persist through SQLite, `electron-store`, or on-disk assets.

## Main modules

### `src/main/session-machine.ts`

- owns start, pause, resume, and complete transitions
- writes durable session and segment state
- persists heartbeats while work is active
- applies the current reminder-interval setting to newly created sessions

### `src/main/recovery-service.ts`

- runs before normal UI flow on startup
- detects unclean shutdown state
- reconciles stale active sessions
- preserves incomplete checkpoint shells

### `src/main/checkpoint-service.ts`

- creates reminder and manual checkpoint shells after explicit screenshot confirmation
- supports delayed capture so tray and reminder flows can hide the UI and wait before the shot
- enforces the two-phase checkpoint write
- finalizes note text separately from screenshot capture

### `src/main/reminder-prompt-service.ts`

- raises worked-time reminder prompts in main
- keeps reminder prompts durable and recoverable
- supports `Take Screenshot`, `Skip`, and `Snooze 1 min`
- only creates the checkpoint shell after the user confirms capture

### `src/main/settings-service.ts`

- stores only app settings in `electron-store`
- persists reminder interval and launch-at-login
- applies Windows login-item changes from main

### `src/main/logger.ts`

- appends operational logs under the app data log directory
- records bootstrap, recovery, session, checkpoint, media, and export events
- captures unexpected main-process failures for post-crash debugging

### `src/main/export-service.ts`

- reads saved export compositions and timeline segments
- builds timeline-aligned slide clips with FFmpeg
- overlays worked offsets and note text onto each segment
- attaches voice-over audio when available
- appends a normalized appendix clip at the end when available
- writes the final MP4 to a user-visible destination instead of only app data
- updates `activeExportJob` in app state so the renderer can show progress

## Error handling

- main-process IPC handlers are wrapped and logged
- uncaught exceptions and unhandled rejections are logged and surfaced into app state
- renderer-process crashes and unresponsive states are surfaced into app state
- the dashboard can dismiss non-fatal main-process error messages without discarding durable session state

## Renderer responsibilities

- mirrors main-process app state
- shows session, timeline, recovery, export, and settings UI
- renders a clean hierarchical desktop layout instead of the earlier brutalist shell
- records microphone audio only as an input mechanism
- records checkpoint switches during voice-over capture so narration timing can drive the final visuals
- sends recorded audio bytes to main for durable storage
- never owns authoritative session timing, checkpoint persistence, or export job state
