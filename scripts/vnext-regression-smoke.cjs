const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sessiontrail-vnext-"));
  app.setPath("userData", tempRoot);
  app.setPath("sessionData", path.join(tempRoot, "session-data"));

  await app.whenReady();

  const { initializeAppState } = require("../dist/main/app-state.js");
  const { getDatabase, closeDatabase } = require("../dist/main/db/db.js");
  const { runMigrations } = require("../dist/main/db/migrator.js");
  const { SettingsService } = require("../dist/main/settings-service.js");
  const { SessionMachine } = require("../dist/main/session-machine.js");
  const { CheckpointService } = require("../dist/main/checkpoint-service.js");
  const { ReminderPromptService } = require("../dist/main/reminder-prompt-service.js");
  const { ReminderScheduler } = require("../dist/main/scheduler.js");
  const { ExportService } = require("../dist/main/export-service.js");
  const { RuntimeStateStore, RUNTIME_STATE_KEYS } = require("../dist/main/runtime-state-store.js");
  const { CheckpointRepository } = require("../dist/main/db/repos/checkpoint-repository.js");
  const { ScreenshotAssetRepository } = require("../dist/main/db/repos/screenshot-asset-repository.js");
  const { SessionRepository } = require("../dist/main/db/repos/session-repository.js");

  initializeAppState("0.0.0-test");

  const settingsService = new SettingsService();
  settingsService.initialize();

  const db = getDatabase();
  runMigrations(db);

  const sessionMachine = new SessionMachine(db, settingsService);
  const checkpointService = new CheckpointService(db);
  const reminderPromptService = new ReminderPromptService(
    db,
    sessionMachine,
    checkpointService,
    settingsService
  );
  const reminderScheduler = new ReminderScheduler(sessionMachine, reminderPromptService);
  const runtimeStateStore = new RuntimeStateStore(db);
  const checkpointRepository = new CheckpointRepository(db);
  const screenshotAssetRepository = new ScreenshotAssetRepository(db);
  const sessionRepository = new SessionRepository(db);

  sessionMachine.initialize();

  async function createEndedSession(title, endAction) {
    const started = sessionMachine.start({ title });
    await wait(15);
    const ended = endAction === "cancel"
      ? sessionMachine.cancel(started.id)
      : sessionMachine.complete(started.id);
    await wait(15);
    return ended;
  }

  const completedOne = await createEndedSession("History Completed 1", "complete");
  const canceledOne = await createEndedSession("History Canceled 1", "cancel");
  const completedTwo = await createEndedSession("History Completed 2", "complete");
  const canceledTwo = await createEndedSession("History Canceled 2", "cancel");
  const completedThree = await createEndedSession("History Completed 3", "complete");

  const firstCompletedPage = sessionMachine.listHistory({
    query: "History",
    status: "completed",
    limit: 2,
    offset: 0
  });
  assert.equal(firstCompletedPage.total, 3, "Expected 3 completed history sessions.");
  assert.deepEqual(
    firstCompletedPage.items.map((item) => item.id),
    [completedThree.id, completedTwo.id],
    "History should be newest-first."
  );

  const secondCompletedPage = sessionMachine.listHistory({
    query: "History",
    status: "completed",
    limit: 2,
    offset: 2
  });
  assert.equal(secondCompletedPage.items.length, 1, "Expected the second page to contain one result.");
  assert.equal(secondCompletedPage.items[0].id, completedOne.id, "Expected paginated history to reach older items.");

  const canceledPage = sessionMachine.listHistory({
    query: "History",
    status: "canceled",
    limit: 10,
    offset: 0
  });
  assert.deepEqual(
    canceledPage.items.map((item) => item.id),
    [canceledTwo.id, canceledOne.id],
    "Canceled history filter should only return canceled sessions."
  );

  const reminderSession = sessionMachine.start({ title: "Reminder resume smoke" });
  const reminderEntity = sessionRepository.findById(reminderSession.id);
  reminderEntity.reminderIntervalMinutes = 1;
  reminderEntity.workedSeconds = 59;
  reminderEntity.lastHeartbeatAt = nowIso();
  reminderEntity.updatedAt = reminderEntity.lastHeartbeatAt;
  sessionRepository.update(reminderEntity);

  const suspended = sessionMachine.suspend(reminderSession.id);
  assert.equal(suspended.status, "paused", "Suspend should pause the session.");
  await wait(1200);
  const resumed = sessionMachine.resume(reminderSession.id);
  assert.equal(resumed.status, "active", "Resume should reactivate the session.");

  await reminderScheduler.tick();
  assert.equal(
    reminderPromptService.getPendingPrompt(),
    null,
    "Sleep time should not trigger the next reminder after resume."
  );

  const updatedReminderEntity = sessionRepository.findById(reminderSession.id);
  updatedReminderEntity.lastHeartbeatAt = nowIso(-1500);
  updatedReminderEntity.updatedAt = nowIso();
  sessionRepository.update(updatedReminderEntity);

  await reminderScheduler.tick();
  const resumedPrompt = reminderPromptService.getPendingPrompt();
  assert.ok(resumedPrompt, "Reminder prompt should fire once actual worked time reaches the threshold.");
  assert.equal(resumedPrompt.sessionId, reminderSession.id);

  sessionMachine.complete(reminderSession.id);

  const screenshotDir = path.join(tempRoot, "checkpoint-smoke");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const olderScreenshotPath = path.join(screenshotDir, "older.png");
  const newerScreenshotPath = path.join(screenshotDir, "newer.png");
  fs.writeFileSync(olderScreenshotPath, Buffer.from(TINY_PNG_BASE64, "base64"));
  fs.writeFileSync(newerScreenshotPath, Buffer.from(TINY_PNG_BASE64, "base64"));

  const shellSessionId = completedThree.id;
  const olderCheckpointId = "checkpoint-shell-older";
  const newerCheckpointId = "checkpoint-shell-newer";

  checkpointRepository.create({
    id: olderCheckpointId,
    sessionId: shellSessionId,
    occurredAt: nowIso(-2000),
    workedOffsetSeconds: 45,
    status: "shell",
    noteText: null,
    reminderTriggered: true,
    manualCheckpoint: false,
    createdAt: nowIso(-2000),
    updatedAt: nowIso(-2000)
  });
  screenshotAssetRepository.create({
    id: "screenshot-shell-older",
    checkpointId: olderCheckpointId,
    filePath: olderScreenshotPath,
    width: 1,
    height: 1,
    captureMode: "full_desktop",
    createdAt: nowIso(-2000)
  });

  checkpointRepository.create({
    id: newerCheckpointId,
    sessionId: shellSessionId,
    occurredAt: nowIso(-1000),
    workedOffsetSeconds: 60,
    status: "shell",
    noteText: null,
    reminderTriggered: false,
    manualCheckpoint: true,
    createdAt: nowIso(-1000),
    updatedAt: nowIso(-1000)
  });
  screenshotAssetRepository.create({
    id: "screenshot-shell-newer",
    checkpointId: newerCheckpointId,
    filePath: newerScreenshotPath,
    width: 1,
    height: 1,
    captureMode: "full_desktop",
    createdAt: nowIso(-1000)
  });

  runtimeStateStore.setJson(RUNTIME_STATE_KEYS.pendingCheckpoint, null);
  const restoredCheckpointService = new CheckpointService(db);
  restoredCheckpointService.initialize();
  const restoredPendingCheckpoint = restoredCheckpointService.getPendingCheckpoint();
  assert.ok(restoredPendingCheckpoint, "Pending checkpoint should restore on initialize.");
  assert.equal(
    restoredPendingCheckpoint.checkpoint.id,
    newerCheckpointId,
    "Checkpoint restore should reopen the newest shell checkpoint."
  );
  assert.match(
    restoredPendingCheckpoint.screenshotDataUrl,
    /^data:image\/png;base64,/,
    "Restored checkpoint should include a preview data URL."
  );

  const interruptedJob = {
    id: "export-interrupted-job",
    sessionId: completedTwo.id,
    status: "running",
    progressRatio: 0.42,
    message: "Rendering timeline clips",
    outputFilePath: null,
    startedAt: nowIso(-5000),
    updatedAt: nowIso(-5000),
    errorMessage: null
  };
  runtimeStateStore.setJson(RUNTIME_STATE_KEYS.activeExportJob, interruptedJob);

  const interruptedExportService = new ExportService(db, settingsService);
  interruptedExportService.initialize();
  const recoveredJob = interruptedExportService.getActiveJob();
  assert.ok(recoveredJob, "Interrupted export should restore into app state.");
  assert.equal(recoveredJob.status, "failed");
  assert.match(recoveredJob.message, /interrupted/i);

  const cancelExportService = new ExportService(db, settingsService);
  let killCalled = false;
  cancelExportService.activeJob = { ...interruptedJob };
  cancelExportService.activeFfmpegProcess = {
    kill() {
      killCalled = true;
    }
  };
  const canceledJob = cancelExportService.cancel();
  assert.ok(killCalled, "Cancel should terminate the active FFmpeg process.");
  assert.ok(canceledJob, "Cancel should return the active job.");
  assert.equal(canceledJob.message, "Canceling export");

  const restartExportService = new ExportService(db, settingsService);
  restartExportService.execute = async function patchedExecute(job) {
    this.activeJob = {
      ...job,
      status: "completed",
      progressRatio: 1,
      message: "Export complete",
      outputFilePath: path.join(tempRoot, "final-smoke-export.mp4"),
      updatedAt: nowIso(),
      errorMessage: null
    };
  };
  restartExportService.run({ sessionId: completedOne.id });
  await wait(0);
  const restartedJob = restartExportService.getActiveJob();
  assert.ok(restartedJob, "Retry should create a new export job.");
  assert.equal(restartedJob.status, "completed", "Retry should be allowed immediately after interruption recovery.");

  console.log("VNext regression smoke passed.", {
    userData: tempRoot,
    restoredCheckpointId: restoredPendingCheckpoint.checkpoint.id,
    resumedPromptId: resumedPrompt.id,
    recoveredExportJobId: recoveredJob.id
  });

  closeDatabase();
  app.quit();
}

main().catch((error) => {
  console.error("VNext regression smoke failed.", error);
  try {
    const { closeDatabase } = require("../dist/main/db/db.js");
    closeDatabase();
  } catch {}
  app.exit(1);
});
