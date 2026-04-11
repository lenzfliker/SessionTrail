import { app, ipcMain } from "electron";
import { clearLastError, dismissResumeNotice, getAppState, patchAppState } from "./app-state";
import type { CheckpointService } from "./checkpoint-service";
import type { ExportService } from "./export-service";
import { logError } from "./logger";
import type { MediaService } from "./media-service";
import type { ReflectService } from "./reflect-service";
import type { RecoveryService } from "./recovery-service";
import type { ReminderPromptService } from "./reminder-prompt-service";
import type { SessionMachine } from "./session-machine";
import type { SettingsService } from "./settings-service";
import type { SnailPetService } from "./pet/snail-pet-service";
import { hideDashboardWindow, showDashboardWindow, toggleDashboardWindow } from "./window-manager";
import type { SessionCancelResult, SessionSummary } from "../shared/contracts";
import { IPC_CHANNELS } from "../shared/ipc";

function registerHandler(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      logError(`IPC handler failed for ${channel}.`, error);
      patchAppState({ lastErrorMessage: error instanceof Error ? error.message : "Unexpected application error" });
      throw error;
    }
  });
}

function resolveCancelableSession(sessionMachine: SessionMachine, sessionId?: string): SessionSummary {
  const session = sessionId ? sessionMachine.getById(sessionId) : sessionMachine.getActive();
  if (!session || (session.status !== "active" && session.status !== "paused")) {
    throw new Error("No active or paused session exists to cancel.");
  }

  return session;
}

function resolveExistingSession(sessionMachine: SessionMachine, sessionId?: string): SessionSummary {
  const session = sessionId ? sessionMachine.getById(sessionId) : sessionMachine.getActive();
  if (!session) {
    throw new Error("No session exists to delete.");
  }

  return session;
}

function deleteSessionWithArtifacts(
  sessionMachine: SessionMachine,
  mediaService: MediaService,
  sessionId?: string
): SessionCancelResult {
  const session = resolveExistingSession(sessionMachine, sessionId);
  mediaService.deleteSessionArtifacts(session.id);
  sessionMachine.deleteSession(session.id);
  return {
    outcome: "deleted",
    session
  };
}

export function registerIpcHandlers(
  sessionMachine: SessionMachine,
  recoveryService: RecoveryService,
  checkpointService: CheckpointService,
  reminderPromptService: ReminderPromptService,
  mediaService: MediaService,
  exportService: ExportService,
  settingsService: SettingsService,
  reflectService: ReflectService,
  snailPetService: SnailPetService
): void {
  registerHandler(IPC_CHANNELS.getAppState, () => getAppState());
  registerHandler(IPC_CHANNELS.showDashboard, () => showDashboardWindow());
  registerHandler(IPC_CHANNELS.hideDashboard, () => hideDashboardWindow());
  registerHandler(IPC_CHANNELS.toggleDashboard, () => toggleDashboardWindow());
  registerHandler(IPC_CHANNELS.clearLastError, () => clearLastError());
  registerHandler(IPC_CHANNELS.dismissResumeNotice, () => dismissResumeNotice());
  registerHandler(IPC_CHANNELS.settingsGet, () => settingsService.getSettings());
  registerHandler(IPC_CHANNELS.settingsSet, async (_event, input) => {
    const settings = settingsService.setSettings(input as Parameters<typeof settingsService.setSettings>[0]);
    patchAppState({ settings });
    await snailPetService.applySettings(settings);
    return settings;
  });
  registerHandler(IPC_CHANNELS.quit, async () => {
    setImmediate(() => app.quit());
  });

  registerHandler(IPC_CHANNELS.sessionStart, (_event, payload) => sessionMachine.start(payload as Parameters<typeof sessionMachine.start>[0]));
  registerHandler(IPC_CHANNELS.sessionPause, (_event, sessionId?: string) => sessionMachine.pause(sessionId));
  registerHandler(IPC_CHANNELS.sessionResume, (_event, sessionId?: string) =>
    sessionMachine.resume(sessionId)
  );
  registerHandler(IPC_CHANNELS.sessionComplete, (_event, sessionId?: string) =>
    sessionMachine.complete(sessionId)
  );
  registerHandler(IPC_CHANNELS.sessionCancel, (_event, sessionId?: string) => ({
    outcome: "kept",
    session: sessionMachine.cancel(resolveCancelableSession(sessionMachine, sessionId).id)
  }));
  registerHandler(IPC_CHANNELS.sessionDelete, (_event, sessionId?: string) =>
    deleteSessionWithArtifacts(sessionMachine, mediaService, sessionId)
  );
  registerHandler(IPC_CHANNELS.sessionRename, (_event, input) =>
    sessionMachine.rename(input)
  );
  registerHandler(IPC_CHANNELS.sessionGetActive, () => sessionMachine.getActive());
  registerHandler(IPC_CHANNELS.sessionGetById, (_event, sessionId: string) =>
    sessionMachine.getById(sessionId)
  );
  registerHandler(IPC_CHANNELS.sessionListRecent, () => sessionMachine.listRecent());
  registerHandler(IPC_CHANNELS.sessionListHistory, (_event, query) => sessionMachine.listHistory(query));
  registerHandler(IPC_CHANNELS.reflectGetSummary, (_event, query) => reflectService.getSummary(query));
  registerHandler(IPC_CHANNELS.reflectExportReport, (_event, query) => reflectService.exportReport(query));
  registerHandler(IPC_CHANNELS.reminderGetPendingPrompt, () =>
    reminderPromptService.getPendingPrompt()
  );
  registerHandler(IPC_CHANNELS.reminderTakeScreenshot, (_event, reminderPromptId: string) =>
    reminderPromptService.takeScreenshot(reminderPromptId)
  );
  registerHandler(IPC_CHANNELS.reminderSkip, (_event, reminderPromptId: string) =>
    reminderPromptService.skip(reminderPromptId)
  );
  registerHandler(IPC_CHANNELS.reminderSnooze, (_event, reminderPromptId: string) =>
    reminderPromptService.snooze(reminderPromptId)
  );
  registerHandler(IPC_CHANNELS.checkpointCreateManual, async (_event, sessionId: string) => {
    const session = sessionMachine.getById(sessionId);
    if (!session || (session.status !== "active" && session.status !== "paused")) {
      throw new Error("Manual checkpoints require an active or paused session.");
    }

    const workedOffsetSeconds = sessionMachine.getWorkedSecondsForCheckpoint(sessionId);
    return checkpointService.createManualCheckpoint(session, workedOffsetSeconds, {
      captureDelayMs: settingsService.getSettings().captureDelaySeconds * 1_000,
      hideDashboardBeforeCapture: true
    });
  });
  registerHandler(IPC_CHANNELS.checkpointRetake, (_event, checkpointId: string) =>
    checkpointService.retakePendingCheckpoint(checkpointId, {
      captureDelayMs: settingsService.getSettings().captureDelaySeconds * 1_000,
      hideDashboardBeforeCapture: true
    })
  );
  registerHandler(IPC_CHANNELS.checkpointFinalize, (_event, input) =>
    checkpointService.finalizeCheckpoint(input.checkpointId, input.noteText)
  );
  registerHandler(IPC_CHANNELS.checkpointReplacePendingScreenshot, (_event, input) =>
    checkpointService.replacePendingScreenshot(input.checkpointId, input.buffer)
  );
  registerHandler(IPC_CHANNELS.checkpointUpdateNote, (_event, input) =>
    checkpointService.updateCheckpointNote(input.checkpointId, input.noteText)
  );
  registerHandler(IPC_CHANNELS.checkpointDelete, (_event, checkpointId: string) =>
    checkpointService.deleteCheckpoint(checkpointId)
  );
  registerHandler(IPC_CHANNELS.checkpointListForSession, (_event, sessionId: string) =>
    checkpointService.listForSession(sessionId)
  );
  registerHandler(IPC_CHANNELS.checkpointGetScreenshotPreview, (_event, checkpointId: string) =>
    checkpointService.getScreenshotPreview(checkpointId)
  );
  registerHandler(IPC_CHANNELS.audioSaveRecording, (_event, input) =>
    mediaService.saveRecording(input)
  );
  registerHandler(IPC_CHANNELS.audioGetLatestVoiceOver, (_event, sessionId: string) =>
    mediaService.getLatestVoiceOver(sessionId)
  );
  registerHandler(IPC_CHANNELS.audioPreparePreview, (_event, audioAssetId: string) =>
    mediaService.preparePreview(audioAssetId)
  );
  registerHandler(IPC_CHANNELS.audioGetPreparedPreview, (_event, audioAssetId: string) =>
    mediaService.getPreparedPreview(audioAssetId)
  );
  registerHandler(IPC_CHANNELS.mediaImportAssets, (_event, sessionId: string) =>
    mediaService.importAssets(sessionId)
  );
  registerHandler(IPC_CHANNELS.mediaListImports, (_event, sessionId: string) =>
    mediaService.listImports(sessionId)
  );
  registerHandler(IPC_CHANNELS.mediaGetImportById, (_event, assetId: string) =>
    mediaService.getImportById(assetId)
  );
  registerHandler(IPC_CHANNELS.mediaDeleteImport, (_event, assetId: string) =>
    mediaService.deleteImport(assetId)
  );
  registerHandler(IPC_CHANNELS.exportRun, (_event, input) => exportService.run(input));
  registerHandler(IPC_CHANNELS.exportCancel, () => exportService.cancel());
  registerHandler(IPC_CHANNELS.exportGetActiveJob, () => exportService.getActiveJob());
  registerHandler(IPC_CHANNELS.exportGetComposition, (_event, sessionId: string) =>
    exportService.getComposition(sessionId)
  );
  registerHandler(IPC_CHANNELS.exportSaveComposition, (_event, input) =>
    exportService.saveComposition(input)
  );
  registerHandler(IPC_CHANNELS.exportChooseOutputPath, (_event, sessionId: string) =>
    exportService.chooseOutputPath(sessionId)
  );
  registerHandler(IPC_CHANNELS.exportRevealOutput, (_event, sessionId: string) =>
    exportService.revealOutput(sessionId)
  );
  registerHandler(IPC_CHANNELS.exportOpenOutput, (_event, sessionId: string) =>
    exportService.openOutput(sessionId)
  );
  registerHandler(IPC_CHANNELS.recoveryGetPending, () => recoveryService.getPending());
  registerHandler(IPC_CHANNELS.recoveryResume, (_event, sessionId?: string) =>
    recoveryService.resume(sessionId)
  );
  registerHandler(IPC_CHANNELS.recoveryLeavePaused, (_event, sessionId?: string) =>
    recoveryService.leavePaused(sessionId)
  );
  registerHandler(IPC_CHANNELS.recoveryEndNow, (_event, sessionId?: string) =>
    recoveryService.endNow(sessionId)
  );
}
