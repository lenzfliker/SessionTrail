# SessionTrail — Product Requirements

## Summary

SessionTrail is a Windows-first desktop tray app for documenting 2-hour work sessions with periodic reminders, screenshots, notes, crash recovery, and exportable progress videos.

## Primary user

A remote worker who must periodically reflect on progress and later submit a video update summarizing a focused work session.

## Final decisions

- App name: SessionTrail
- Platform: Windows-first
- Primary stack: Electron + TypeScript + React
- Reminder interval default: 10 minutes
- Screenshot mode v1: full desktop only
- Session target: 2 hours worked time
- Overtime: allowed manually after 2 hours
- Voice-over in v1: record + preview
- UI style: minimal clean hierarchical desktop UI

## Core problem

The user needs a low-friction system that:

1. prompts for progress during work,
2. captures credible artifacts,
3. survives unexpected shutdowns,
4. lets the user resume and finish later,
5. exports a simple review video.

## Core user stories

- As a user, I can start a tracked session from the tray.
- As a user, I can pause and resume the session.
- As a user, reminders fire every 10 worked minutes.
- As a user, reminders prompt me to manually confirm screenshot capture.
- As a user, I can write a short note for that checkpoint.
- As a user, I can cancel a session and either keep or delete its data.
- As a user, if my PC loses power, previously saved progress is preserved.
- As a user, when I relaunch the app, I can resume an interrupted session.
- As a user, I can review my checkpoints on a timeline.
- As a user, I can record and preview a voice-over.
- As a user, I can switch checkpoints while recording so narration timing drives which screenshot is shown.
- As a user, I can preview voice-over playback and see the timeline follow it.
- As a user, I can append a screen recording clip at the end.
- As a user, I can remove an attached appendix clip before export.
- As a user, I can export a final MP4.

## Non-goals for v1

- full nonlinear video editor
- OCR
- subtitles
- AI summarization
- built-in full screen recording
- cloud sync
- collaboration

## Success criteria

- reminders fire correctly by worked time, not wall time
- screenshots and notes survive crashes
- session resume works after power loss
- export produces a playable MP4
- workflow is simple enough to use daily

## Constraints

- must be implementable by Codex in one day
- must use local-first persistence
- renderer must not own critical state
- UI should stay minimal and functional
