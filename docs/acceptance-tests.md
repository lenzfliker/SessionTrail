# SessionTrail - Acceptance Tests

## A. Startup and settings

- launch the app
- verify the tray and dashboard both appear
- change reminder interval and relaunch
- verify the new value persists through `electron-store`
- toggle launch-at-login and verify the setting persists

## B. Session timing

- start a session
- verify worked time increases
- verify the next reminder is based on worked time

## C. Pause and resume

- start a session
- pause it
- wait two real minutes
- verify worked time does not increase while paused
- resume it
- verify worked time resumes correctly

## D. Reminder checkpoint

- trigger a reminder checkpoint
- verify the reminder overlay appears first
- click `Take screenshot`
- verify checkpoint shell row is created first
- verify screenshot file exists
- verify screenshot asset row exists
- verify the checkpoint note inspector opens in the main workspace
- save note
- verify checkpoint becomes completed

## E. Crash during active session

- start an active session
- wait until heartbeat is written
- force-close the process
- relaunch
- verify recovery appears before the dashboard workflow
- verify stale active work is reconciled from durable state

## F. Crash during checkpoint note

- trigger a checkpoint
- force-close before note save
- relaunch
- verify the screenshot and shell checkpoint are preserved
- verify the note can still be finalized later

## G. Non-fatal error handling

- trigger a recoverable error path from the UI
- verify the dashboard surfaces the latest main-process error
- dismiss the error
- verify session state and recovery state remain usable
- verify a log entry is written

## H. Export

- select a session with completed checkpoints
- record a voice-over
- preview the recorded voice-over and verify the playhead plus active checkpoint follow playback
- record checkpoint switches during live voice-over or edit segment timing manually
- import an appendix screen-recording clip
- remove the appendix clip and verify it detaches from the composition
- run export
- verify progress appears in the export screen
- verify the final MP4 is playable
- verify screenshot changes follow the saved timeline composition
- verify the appendix clip appears after the narrated timeline

## I. Timeline review

- open timeline for a session with checkpoints
- verify screenshot thumbnails are visible
- verify worked offsets are shown
- verify the horizontal timeline shows screen, voice, and appendix tracks
- drag a segment boundary and save the timeline
- verify segment timing persists after reload
- create a manual checkpoint
- verify it appears in the timeline after finalization

## J. Session cancel

- start or resume a session
- cancel and choose `Dismiss`
- verify the session remains open
- cancel and choose `Keep session data`
- verify the session becomes `canceled`
- start a new session, cancel, and choose `Delete session data`
- verify the session and its media files are removed

## K. Installed Windows notification branding

- run `npm run make`
- install the generated `SessionTrail-<version> Setup.exe`
- launch SessionTrail from the Start menu shortcut
- trigger a reminder notification
- verify the notification header shows `SessionTrail`
- verify the notification uses the SessionTrail app icon instead of Electron branding
