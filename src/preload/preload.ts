import { contextBridge, ipcRenderer } from "electron";
import type { SessionTrailApi } from "../shared/contracts";
import { IPC_CHANNELS } from "../shared/ipc";

const api: SessionTrailApi = {
  app: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.getAppState),
    showDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.showDashboard),
    hideDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.hideDashboard),
    toggleDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.toggleDashboard),
    minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
    toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
    closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
    clearLastError: () => ipcRenderer.invoke(IPC_CHANNELS.clearLastError),
    dismissResumeNotice: () => ipcRenderer.invoke(IPC_CHANNELS.dismissResumeNotice),
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.quit),
    onStateChanged: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        state: Parameters<typeof listener>[0]
      ) => {
        listener(state);
      };

      ipcRenderer.on(IPC_CHANNELS.stateChanged, wrappedListener);

      return () => {
        ipcRenderer.off(IPC_CHANNELS.stateChanged, wrappedListener);
      };
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, input),
    chooseExportDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settingsChooseExportDirectory)
  },
  session: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionStart, input),
    pause: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionPause, sessionId),
    resume: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionResume, sessionId),
    complete: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionComplete, sessionId),
    cancel: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionCancel, sessionId),
    delete: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionDelete, sessionId),
    rename: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionRename, input),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.sessionGetActive),
    getById: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.sessionGetById, sessionId),
    listRecent: () => ipcRenderer.invoke(IPC_CHANNELS.sessionListRecent),
    listHistory: (query) => ipcRenderer.invoke(IPC_CHANNELS.sessionListHistory, query),
    onUpdated: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        session: Parameters<typeof listener>[0]
      ) => {
        listener(session);
      };

      ipcRenderer.on(IPC_CHANNELS.sessionUpdated, wrappedListener);

      return () => {
        ipcRenderer.off(IPC_CHANNELS.sessionUpdated, wrappedListener);
      };
    }
  },
  reflect: {
    getSummary: (query) => ipcRenderer.invoke(IPC_CHANNELS.reflectGetSummary, query),
    exportReport: (query) => ipcRenderer.invoke(IPC_CHANNELS.reflectExportReport, query)
  },
  reminder: {
    getPendingPrompt: () => ipcRenderer.invoke(IPC_CHANNELS.reminderGetPendingPrompt),
    takeScreenshot: (reminderPromptId) =>
      ipcRenderer.invoke(IPC_CHANNELS.reminderTakeScreenshot, reminderPromptId),
    skip: (reminderPromptId) => ipcRenderer.invoke(IPC_CHANNELS.reminderSkip, reminderPromptId),
    snooze: (reminderPromptId) => ipcRenderer.invoke(IPC_CHANNELS.reminderSnooze, reminderPromptId)
  },
  recovery: {
    getPending: () => ipcRenderer.invoke(IPC_CHANNELS.recoveryGetPending),
    resume: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.recoveryResume, sessionId),
    leavePaused: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.recoveryLeavePaused, sessionId),
    endNow: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.recoveryEndNow, sessionId)
  },
  checkpoint: {
    createManual: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.checkpointCreateManual, sessionId),
    retake: (checkpointId) => ipcRenderer.invoke(IPC_CHANNELS.checkpointRetake, checkpointId),
    finalize: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointFinalize, input),
    replacePendingScreenshot: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.checkpointReplacePendingScreenshot, input),
    updateNote: (input) => ipcRenderer.invoke(IPC_CHANNELS.checkpointUpdateNote, input),
    delete: (checkpointId) => ipcRenderer.invoke(IPC_CHANNELS.checkpointDelete, checkpointId),
    listForSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.checkpointListForSession, sessionId),
    getScreenshotPreview: (checkpointId) => ipcRenderer.invoke(IPC_CHANNELS.checkpointGetScreenshotPreview, checkpointId)
  },
  audio: {
    saveRecording: (input) => ipcRenderer.invoke(IPC_CHANNELS.audioSaveRecording, input),
    getLatestVoiceOver: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.audioGetLatestVoiceOver, sessionId),
    preparePreview: (audioAssetId) => ipcRenderer.invoke(IPC_CHANNELS.audioPreparePreview, audioAssetId),
    getPreparedPreview: (audioAssetId) => ipcRenderer.invoke(IPC_CHANNELS.audioGetPreparedPreview, audioAssetId)
  },
  media: {
    importAssets: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.mediaImportAssets, sessionId),
    listImports: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.mediaListImports, sessionId),
    getImportById: (assetId) => ipcRenderer.invoke(IPC_CHANNELS.mediaGetImportById, assetId),
    deleteImport: (assetId) => ipcRenderer.invoke(IPC_CHANNELS.mediaDeleteImport, assetId)
  },
  export: {
    run: (input) => ipcRenderer.invoke(IPC_CHANNELS.exportRun, input),
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.exportCancel),
    getActiveJob: () => ipcRenderer.invoke(IPC_CHANNELS.exportGetActiveJob),
    getComposition: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.exportGetComposition, sessionId),
    saveComposition: (input) => ipcRenderer.invoke(IPC_CHANNELS.exportSaveComposition, input),
    chooseOutputPath: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.exportChooseOutputPath, sessionId),
    revealOutput: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.exportRevealOutput, sessionId),
    openOutput: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.exportOpenOutput, sessionId)
  }
};

contextBridge.exposeInMainWorld("sessionTrail", api);
