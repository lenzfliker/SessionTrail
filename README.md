# SessionTrail

<p align="center">
  <img src="public/icons/sessiontrail-app-icon.png" alt="SessionTrail logo" width="128" height="128">
</p>

SessionTrail is a Windows-first desktop tray app for capturing focused work sessions, checkpoint screenshots, short notes, voice-over narration, and final MP4 recap videos.

Contributor reference: `https://github.com/codex`

## Features

- Tray-based session control with start, pause, resume, complete, and cancel flows.
- Worked-time reminders that create screenshot checkpoints only after explicit confirmation.
- Delayed desktop capture so the user can switch to the work surface before the screenshot.
- Durable checkpoint notes and recovery after app crashes or unexpected shutdowns.
- Session history with rename, delete, and recoverable canceled-session flows.
- Voice-over recording with checkpoint switching that drives export timing.
- Timeline editing for checkpoint segments before export.
- Appendix video import and removal before final MP4 generation.
- Reflect analytics views for reviewing work patterns and interruptions.

## Stack

- Electron
- TypeScript
- React
- SQLite via `better-sqlite3`
- `electron-store`
- FFmpeg via `ffmpeg-static`

## Development

```bash
npm install
npm run dev
```

Useful commands:

- `npm run typecheck`
- `npm run build`
- `npm run smoke:session-machine`
- `npm run smoke:reflect-analytics`
- `npm run smoke:vnext-regression`

## Windows Packaging

Build the production installer:

```bash
npm run make
```

Artifacts are written to:

- `out/make/squirrel.windows/x64/SessionTrail-<version> Setup.exe`
- `out/make/squirrel.windows/x64/SessionTrail-<version>-full.nupkg`

Installed builds should show the SessionTrail app name and icon in Windows notifications. Development runs launched from `npm start` or `npm run dev` may still show Electron branding because they run the raw Electron binary.

## Where Files Are Saved

Installer location:

- `%LocalAppData%\\SessionTrail`

Runtime app data:

- `%APPDATA%\\SessionTrail\\data\\sessiontrail.db` for the SQLite database
- `%APPDATA%\\SessionTrail\\assets\\screenshots\\<sessionId>` for checkpoint screenshots
- `%APPDATA%\\SessionTrail\\assets\\audio\\<sessionId>` for voice-over assets
- `%APPDATA%\\SessionTrail\\assets\\video\\<sessionId>` for imported and generated video assets
- `%APPDATA%\\SessionTrail\\exports\\jobs` for export job working files
- `%APPDATA%\\SessionTrail\\logs\\sessiontrail.log` for logs
- `%TEMP%\\SessionTrail\\session-data` for Electron session temp data

User-visible exports:

- Default output is `%USERPROFILE%\\Downloads`
- A custom export directory can be set in Settings

See [docs/windows-installation.md](docs/windows-installation.md) for the full Windows install and storage reference.

## Docs

- [docs/architecture.md](docs/architecture.md)
- [docs/acceptance-tests.md](docs/acceptance-tests.md)
- [docs/manual-test-script.md](docs/manual-test-script.md)
- [docs/windows-installation.md](docs/windows-installation.md)
