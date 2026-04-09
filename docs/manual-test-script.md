# SessionTrail - Manual Test Script

## Automated smoke checks

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Run `npm run smoke:session-machine`.
4. Run `npm run smoke:reflect-analytics`.
5. Run `npm run smoke:vnext-regression`.
6. Run `npm run make`.
7. Confirm `out/make/squirrel.windows/x64/SessionTrail-<version> Setup.exe` exists.

## Startup and settings smoke test

1. Run `npm install`.
3. Run `npm start`.
4. Confirm the tray icon appears and, by default, the dashboard stays hidden on startup.
5. Open the dashboard from the tray.
6. Change reminder interval, capture delay, startup behavior, and default export directory in Settings and save them.
7. Toggle `Launch at login`, `Open dashboard on reminder`, `UI sounds`, and `UI motion`, then save again.
8. Quit and relaunch.
9. Confirm the saved settings are still present and startup behavior matches the saved option.

## Installed build smoke test

1. Run `npm run make`.
2. Install `out/make/squirrel.windows/x64/SessionTrail-<version> Setup.exe`.
3. Launch SessionTrail from the Start menu shortcut.
4. Trigger a reminder notification.
5. Confirm the notification header shows `SessionTrail` instead of `electron.app.Electron`.
6. Confirm the notification uses the installed app icon.
7. Open `%LocalAppData%\SessionTrail` and confirm the installed app files exist.
8. Open `%APPDATA%\SessionTrail` and confirm runtime data directories are created after first launch.

## Persistence core smoke test

1. Start a session.
2. Let it run for at least 20 seconds.
3. Pause the session.
4. Resume the same session.
5. Complete the session.
6. Relaunch and confirm the session appears in recent sessions.
7. Use History search and pagination to locate the session.
8. Rename the session from Track and confirm the new title persists after relaunch without moving the row to the top.
9. Delete a completed or canceled history session and confirm the row disappears.

## Recovery smoke test

1. Start a session.
2. Let at least one heartbeat write occur.
3. Force-close the app from Task Manager.
4. Relaunch.
5. Confirm recovery appears before normal workflow.
6. Confirm the stale active session is paused, not still active.
7. Test `Resume`, `Leave paused`, and `End session` on separate relaunches.

## Checkpoint smoke test

1. Start or resume a session.
2. Wait for the first reminder or temporarily lower the reminder threshold in code for local testing.
3. Confirm an OS reminder notification appears and, by default, the dashboard does not auto-open.
4. Click the reminder notification or open the dashboard from the tray.
5. Confirm the reminder banner appears with `Take screenshot`, `Snooze 1 min`, and `Skip`.
6. Click `Snooze 1 min` once and confirm the banner clears, then reappears after the snooze interval.
7. Click `Take screenshot`.
8. Switch to another window during the capture delay and confirm the screenshot reflects that desktop state.
9. Confirm a screenshot file is created and a checkpoint shell row exists before note save.
10. Confirm the checkpoint note opens in the blocking checkpoint modal and can be recovered after relaunch while still pending.
11. Save the note and confirm the checkpoint becomes completed.

## Timeline smoke test

1. Open Compose.
2. Select a session with checkpoints.
3. Confirm screenshot thumbnails and worked offsets are visible in the checkpoint strip.
4. Confirm the horizontal timeline shows screen segments, a playhead, and a selected-segment inspector.
5. Click a checkpoint thumbnail and confirm the inspector shows its saved note text.
6. Drag a segment boundary and save the timeline.
7. Close and reopen the app, then confirm the saved segment timing is restored.
8. Create a manual checkpoint and confirm it appears as a selectable checkpoint for the timeline.
9. Confirm the selected checkpoint chip pops subtly and selected segments pulse only when UI motion is enabled.

## Export smoke test

1. Open Compose.
2. Select a session with completed checkpoints.
3. Start live recording and click different checkpoints while speaking.
4. Stop recording and confirm the timeline segments are updated from the recorded checkpoint switches.
5. Click `Preview voice-over` and confirm the playhead moves while the active checkpoint chip and inspector auto-switch with playback.
6. Pause or let playback end and confirm the previously armed checkpoint becomes active again.
7. Confirm the first preview shows a short `Preparing voice-over...` state before native audio playback appears.
8. Import a short appendix video clip.
9. Remove the appendix clip and confirm the appendix track returns to the empty state.
10. Re-import the appendix clip.
11. Confirm the export destination defaults to Downloads and use `Change location` once.
12. Click `Build MP4`.
13. Confirm export progress updates in the UI.
14. Wait for completion and note the output path.
15. Use `Reveal in folder`, `Open file`, and `Retry build`.
16. Play the final MP4 and confirm the visible screenshot changes line up with the recorded narration timing before the appendix clip starts.
17. Confirm the overlay text has no white box and remains readable with a white outline.

## Export cancel and recovery smoke test

1. Start a long enough export.
2. Click `Cancel export`.
3. Confirm progress stops and the job ends in a failed or canceled state with a user-cancel message.
4. Start another export immediately and confirm retry succeeds.
5. Start another export, force-close the app mid-export, relaunch, and confirm the interrupted export is restored as failed and a new export can start immediately.

## Cancel smoke test

1. Start or resume a session.
2. Click `Cancel`.
3. Choose `Dismiss` and confirm the session remains active or paused.
4. Click `Cancel` again and choose `Keep session data`.
5. Confirm the session becomes `canceled` and remains visible in recent sessions.
6. Start another session, click `Cancel`, and choose `Delete session data`.
7. Confirm the session disappears from recent sessions and its media files are removed from the session asset folders.

## Logging and error smoke test

1. Trigger a known non-fatal error path, such as importing an invalid appendix clip.
2. Confirm the dashboard shows a flashing error banner.
3. Dismiss the banner and confirm the app remains usable.
4. Inspect the app data log directory and confirm a new line was written to `sessiontrail.log`.
