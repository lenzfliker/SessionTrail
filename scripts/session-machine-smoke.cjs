const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sessiontrail-smoke-"));
  app.setPath("userData", tempRoot);
  app.setPath("sessionData", path.join(tempRoot, "session-data"));

  await app.whenReady();

  const { getDatabase, closeDatabase } = require("../dist/main/db/db.js");
  const { runMigrations } = require("../dist/main/db/migrator.js");
  const { SettingsService } = require("../dist/main/settings-service.js");
  const { SessionMachine } = require("../dist/main/session-machine.js");

  const settingsService = new SettingsService();
  settingsService.initialize();

  const db = getDatabase();
  runMigrations(db);

  const sessionMachine = new SessionMachine(db, settingsService);
  sessionMachine.initialize();

  const started = sessionMachine.start({ title: "Smoke session" });
  if (started.status !== "active") {
    throw new Error(`Expected active after start, received ${started.status}`);
  }

  const paused = sessionMachine.pause(started.id);
  if (paused.status !== "paused") {
    throw new Error(`Expected paused after pause, received ${paused.status}`);
  }

  const resumed = sessionMachine.resume(started.id);
  if (resumed.status !== "active") {
    throw new Error(`Expected active after resume, received ${resumed.status}`);
  }

  const completed = sessionMachine.complete(started.id);
  if (completed.status !== "completed") {
    throw new Error(`Expected completed after complete, received ${completed.status}`);
  }

  const recent = sessionMachine.listRecent();
  if (!recent.some((session) => session.id === started.id && session.status === "completed")) {
    throw new Error("Completed session not present in recent sessions.");
  }

  console.log("Session machine smoke passed.", {
    userData: tempRoot,
    sessionId: started.id
  });

  closeDatabase();
  app.quit();
}

main().catch((error) => {
  console.error("Session machine smoke failed.", error);
  try {
    const { closeDatabase } = require("../dist/main/db/db.js");
    closeDatabase();
  } catch {}
  app.exit(1);
});
