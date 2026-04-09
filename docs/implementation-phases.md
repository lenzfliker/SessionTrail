# SessionTrail — Implementation Phases

## Phase 0 — scaffold

Goal: bootable project.

Deliverables:

- Electron + TypeScript + Vite + React
- preload bridge
- tray icon
- tiny dashboard window
- clean base styles
- docs folder

## Phase 1 — reliability core

Goal: persistent session engine.

Deliverables:

- DB schema + migrations
- better-sqlite3 integration
- session state machine
- start/pause/resume/complete
- heartbeat writes
- startup recovery reconciliation

## Phase 2 — reminder + capture loop

Goal: usable daily workflow.

Deliverables:

- worked-time reminder scheduler
- notification trigger
- reminder confirmation overlay
- full desktop screenshot capture
- checkpoint shell creation
- note inspector
- note finalization

## Phase 3 — review

Goal: inspect and edit collected progress.

Deliverables:

- session timeline page
- editable horizontal timeline tracks
- checkpoint note editing
- manual checkpoint creation
- recovery UI

## Phase 4 — export

Goal: deliverable artifact.

Deliverables:

- voice-over recording
- live checkpoint switching during recording
- voice-over record and preview
- appendix video import
- FFmpeg export
- progress UI
- final MP4 output

## Phase 5 — hardening

Goal: robustness.

Deliverables:

- logging
- better errors
- startup option
- manual QA script
- acceptance checks
