import { app, powerMonitor } from "electron";
import { join } from "node:path";
import { closeDatabase, getDatabase } from "./db/db";
import { runMigrations } from "./db/migrator";
import { initializeAppState, onAppStateChanged, patchAppState } from "./app-state";
import { CheckpointService } from "./checkpoint-service";
import { ExportService } from "./export-service";
import { registerIpcHandlers } from "./ipc";
import { logError, logInfo } from "./logger";
import { MediaService } from "./media-service";
import { ReflectService } from "./reflect-service";
import { RecoveryService } from "./recovery-service";
import { ReminderPromptService } from "./reminder-prompt-service";
import { stopRendererServer } from "./renderer-server";
import { ReminderScheduler } from "./scheduler";
import { SessionMachine } from "./session-machine";
import { SettingsService } from "./settings-service";
import { createTray, refreshTrayMenu } from "./tray";
import {
  createDashboardWindow,
  getDashboardWindow,
  prepareForQuit,
  showDashboardWindow,
  toggleDashboardWindow
} from "./window-manager";
import { IPC_CHANNELS } from "../shared/ipc";

const electronSquirrelStartup = require("electron-squirrel-startup") as boolean;
const WINDOWS_APP_USER_MODEL_ID = "com.squirrel.SessionTrail.SessionTrail";

if (electronSquirrelStartup) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
app.commandLine.appendSwitch("allow-file-access-from-files");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.setPath("sessionData", join(app.getPath("temp"), "SessionTrail", "session-data"));

let sessionMachine: SessionMachine | null = null;
let recoveryService: RecoveryService | null = null;
let checkpointService: CheckpointService | null = null;
let reminderScheduler: ReminderScheduler | null = null;
let reminderPromptService: ReminderPromptService | null = null;
let mediaService: MediaService | null = null;
let exportService: ExportService | null = null;
let settingsService: SettingsService | null = null;
let reflectService: ReflectService | null = null;
let suspendedSessionId: string | null = null;

function reportMainProcessError(message: string, error?: unknown): void {
  logError(message, error);
  patchAppState({
    status: "error",
    lastErrorMessage: error instanceof Error ? `${message} ${error.message}` : message
  });
}

function wrapAction(actionName: string, action: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await action();
      if (getDashboardWindow()) {
        patchAppState({ status: "ready" });
      }
    } catch (error) {
      reportMainProcessError(`${actionName} failed.`, error);
      showDashboardWindow();
    }
  };
}

function registerProcessErrorHandlers(): void {
  process.on("uncaughtException", (error) => {
    reportMainProcessError("Main process uncaught exception.", error);
  });

  process.on("unhandledRejection", (reason) => {
    reportMainProcessError("Main process unhandled rejection.", reason);
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    reportMainProcessError("Renderer process exited unexpectedly.", details);
    if (!webContents.isDestroyed()) {
      webContents.reload();
    }
  });

  app.on("child-process-gone", (_event, details) => {
    reportMainProcessError("Electron child process exited unexpectedly.", details);
  });
}

async function bootstrap(): Promise<void> {
  initializeAppState(app.getVersion());
  settingsService = new SettingsService();
  const settings = settingsService.initialize();
  patchAppState({ settings });
  registerProcessErrorHandlers();
  logInfo("Bootstrapping SessionTrail.");

  const db = getDatabase();
  runMigrations(db);

  sessionMachine = new SessionMachine(db, settingsService);
  checkpointService = new CheckpointService(db);
  mediaService = new MediaService(db);
  exportService = new ExportService(db, settingsService);
  reflectService = new ReflectService(db);
  recoveryService = new RecoveryService(db, sessionMachine);
  reminderPromptService = new ReminderPromptService(db, sessionMachine, checkpointService, settingsService);
  reminderScheduler = new ReminderScheduler(sessionMachine, reminderPromptService);

  sessionMachine.initialize();
  const recovery = recoveryService.runStartupRecovery();
  checkpointService.initialize();
  reminderPromptService.initialize();
  exportService.initialize();

  registerIpcHandlers(
    sessionMachine,
    recoveryService,
    checkpointService,
    reminderPromptService,
    mediaService,
    exportService,
    settingsService,
    reflectService
  );
  await createDashboardWindow();

  const trayOptions = {
    onToggleDashboard: wrapAction("Toggle dashboard", async () => {
      toggleDashboardWindow();
    }),
    onShowDashboard: wrapAction("Show dashboard", async () => {
      showDashboardWindow();
    }),
    onStartSession: wrapAction("Start session", async () => {
      sessionMachine?.start();
      showDashboardWindow();
    }),
    onPauseSession: wrapAction("Pause session", async () => {
      sessionMachine?.pause();
    }),
    onResumeSession: wrapAction("Resume session", async () => {
      sessionMachine?.resume();
      showDashboardWindow();
    }),
    onTakeScreenshot: wrapAction("Take screenshot", async () => {
      if (!sessionMachine || !checkpointService) {
        return;
      }

      const pendingReminderPrompt = reminderPromptService?.getPendingPrompt();
      if (pendingReminderPrompt) {
        await reminderPromptService?.takeScreenshot(pendingReminderPrompt.id);
        return;
      }

      const session = sessionMachine.getActive();
      if (!session || (session.status !== "active" && session.status !== "paused")) {
        return;
      }

      const workedOffsetSeconds = sessionMachine.getWorkedSecondsForCheckpoint(session.id);
      const captureDelayMs = (settingsService?.getSettings().captureDelaySeconds ?? 2) * 1_000;
      await checkpointService.createManualCheckpoint(session, workedOffsetSeconds, {
        captureDelayMs,
        hideDashboardBeforeCapture: true
      });
    }),
    onCompleteSession: wrapAction("Complete session", async () => {
      sessionMachine?.complete();
      showDashboardWindow();
    }),
    onCancelSession: wrapAction("Cancel session", async () => {
      if (!sessionMachine) {
        return;
      }

      sessionMachine.cancel();
      showDashboardWindow();
    }),
    onQuit: wrapAction("Quit application", async () => {
      app.quit();
    })
  };

  onAppStateChanged((state) => {
    refreshTrayMenu(trayOptions);

    const window = getDashboardWindow();
    if (!window) {
      return;
    }

    window.webContents.send(IPC_CHANNELS.stateChanged, state);
  });

  sessionMachine.onUpdated((session) => {
    const window = getDashboardWindow();
    if (!window) {
      return;
    }

    window.webContents.send(IPC_CHANNELS.sessionUpdated, session);
  });

  createTray(trayOptions);
  patchAppState({ status: "ready" });
  if (recovery) {
    patchAppState({ pendingRecovery: recovery });
  }
  reminderScheduler.start();
  if (
    recovery ||
    checkpointService.getPendingCheckpoint() ||
    settings.startupDashboardBehavior === "show_dashboard"
  ) {
    showDashboardWindow();
  }
  logInfo("SessionTrail boot complete.");
}

app.whenReady().then(() => {
  void bootstrap().catch((error) => {
    reportMainProcessError("Failed during bootstrap.", error);
  });
});

app.on("second-instance", () => {
  showDashboardWindow();
});

app.on("activate", () => {
  showDashboardWindow();
});

powerMonitor.on("suspend", () => {
  if (!sessionMachine) {
    return;
  }

  const activeSession = sessionMachine.getActive();
  if (!activeSession || activeSession.status !== "active") {
    suspendedSessionId = null;
    return;
  }

  try {
    const suspended = sessionMachine.suspend(activeSession.id);
    suspendedSessionId = suspended.id;
    logInfo("Paused session because the system is suspending.", { sessionId: suspended.id });
  } catch (error) {
    suspendedSessionId = null;
    reportMainProcessError("Failed to suspend active session before sleep.", error);
  }
});

powerMonitor.on("resume", () => {
  if (!suspendedSessionId) {
    return;
  }

  patchAppState({
    resumeNotice: {
      sessionId: suspendedSessionId,
      reason: "suspend",
      message: "Session paused when the system slept. Resume when ready.",
      resumedAt: new Date().toISOString()
    }
  });
  suspendedSessionId = null;
});

app.on("before-quit", () => {
  reminderScheduler?.stop();
  sessionMachine?.flushForAppShutdown();
  recoveryService?.markCleanShutdown();
  logInfo("Preparing for quit.");
  prepareForQuit();
  stopRendererServer();
  closeDatabase();
});

app.on("window-all-closed", () => {
});
