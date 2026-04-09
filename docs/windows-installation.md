# SessionTrail - Windows Install and Storage

## Installer Output

Running `npm run make` creates Windows installer artifacts under:

- `out/make/squirrel.windows/x64/SessionTrail-<version> Setup.exe`
- `out/make/squirrel.windows/x64/SessionTrail-<version>-full.nupkg`

## Installed Application Path

The Squirrel-based installer installs the app per-user under:

- `%LocalAppData%\SessionTrail`

The versioned application binaries live under a versioned subdirectory inside that install root, such as:

- `%LocalAppData%\SessionTrail\app-0.1.0\SessionTrail.exe`

## Runtime Data Paths

SessionTrail stores its durable runtime data in the Electron `userData` directory, which resolves on Windows to:

- `%APPDATA%\SessionTrail`

Important subpaths:

- `%APPDATA%\SessionTrail\data\sessiontrail.db`
- `%APPDATA%\SessionTrail\assets\screenshots\<sessionId>`
- `%APPDATA%\SessionTrail\assets\audio\<sessionId>`
- `%APPDATA%\SessionTrail\assets\video\<sessionId>`
- `%APPDATA%\SessionTrail\exports\jobs`
- `%APPDATA%\SessionTrail\logs\sessiontrail.log`

## Temporary Data

Electron session temp data is redirected to:

- `%TEMP%\SessionTrail\session-data`

## Final Export Location

Final MP4 exports are user-visible files and do not default to app data storage.

- Default destination: `%USERPROFILE%\Downloads`
- If the user picks another output folder in Settings or in the export flow, the final MP4 is written there instead

## Notification Branding

Installed builds should show the SessionTrail app name and icon in Windows notifications because the packaged app has:

- a real SessionTrail executable name
- a Start menu shortcut created by the installer
- a stable Windows AppUserModelID

Development launches from `npm start` or `npm run dev` can still show Electron branding in notifications because they run the raw Electron binary from `node_modules`.
