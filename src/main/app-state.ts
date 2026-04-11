import { EventEmitter } from "node:events";
import type { AppSettings, AppState, SnailPetRuntimeSummary } from "../shared/contracts";
import { DEFAULT_SNAIL_PET_INSET_PROFILE } from "../shared/snail-pet-inset-profile";

const stateEvents = new EventEmitter();
const defaultSettings: AppSettings = {
  reminderIntervalMinutes: 10,
  defaultTargetMinutes: 120,
  launchAtLogin: false,
  captureDelaySeconds: 2,
  reminderSnoozeMinutes: 1,
  reflectDailyGoalMinutes: 480,
  startupDashboardBehavior: "tray_only",
  openDashboardOnReminder: false,
  defaultExportDirectory: "",
  uiSoundsEnabled: true,
  uiMotionEnabled: true,
  snailPetEnabled: false,
  snailPetScale: 3,
  snailPetSpeed: "normal",
  snailPetInsetProfile: DEFAULT_SNAIL_PET_INSET_PROFILE,
  theme: "clean"
};

const defaultSnailPet: SnailPetRuntimeSummary = {
  visible: false,
  paused: false,
  behaviorState: null
};

let currentState: AppState = {
  appName: "SessionTrail",
  version: "0.0.0",
  platform: process.platform,
  bootedAt: new Date(0).toISOString(),
  status: "booting",
  trayReady: false,
  dashboardVisibility: "hidden",
  dashboardFullscreen: false,
  dashboardMaximized: false,
  activeSession: null,
  recentSessions: [],
  pendingRecovery: null,
  pendingReminderPrompt: null,
  pendingCheckpoint: null,
  activeExportJob: null,
  activeMediaImportJob: null,
  resumeNotice: null,
  settings: defaultSettings,
  snailPet: defaultSnailPet,
  lastErrorMessage: null
};

export function initializeAppState(version: string): AppState {
  currentState = {
    appName: "SessionTrail",
    version,
    platform: process.platform,
    bootedAt: new Date().toISOString(),
    status: "booting",
    trayReady: false,
    dashboardVisibility: "hidden",
    dashboardFullscreen: false,
    dashboardMaximized: false,
    activeSession: null,
    recentSessions: [],
    pendingRecovery: null,
    pendingReminderPrompt: null,
    pendingCheckpoint: null,
    activeExportJob: null,
    activeMediaImportJob: null,
    resumeNotice: null,
    settings: defaultSettings,
    snailPet: defaultSnailPet,
    lastErrorMessage: null
  };

  return currentState;
}

export function getAppState(): AppState {
  return currentState;
}

export function patchAppState(partialState: Partial<AppState>): AppState {
  currentState = {
    ...currentState,
    ...partialState
  };

  stateEvents.emit("changed", currentState);

  return currentState;
}

export function clearLastError(): AppState {
  return patchAppState({ lastErrorMessage: null, status: currentState.status === "error" ? "ready" : currentState.status });
}

export function dismissResumeNotice(): AppState {
  return patchAppState({ resumeNotice: null });
}

export function onAppStateChanged(listener: (state: AppState) => void): () => void {
  stateEvents.on("changed", listener);
  return () => {
    stateEvents.off("changed", listener);
  };
}
