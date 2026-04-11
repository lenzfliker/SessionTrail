import Store from "electron-store";
import { app } from "electron";
import type { AppSettings, UpdateSettingsInput } from "../shared/contracts";
import {
  DEFAULT_SNAIL_PET_INSET_PROFILE,
  migrateSnailPetInsetProfile,
  normalizeSnailPetInsetProfile
} from "../shared/snail-pet-inset-profile";
import { logInfo } from "./logger";

const DEFAULT_SETTINGS: AppSettings = {
  reminderIntervalMinutes: 10,
  defaultTargetMinutes: 120,
  launchAtLogin: false,
  captureDelaySeconds: 2,
  reminderSnoozeMinutes: 1,
  reflectDailyGoalMinutes: 480,
  startupDashboardBehavior: "tray_only",
  openDashboardOnReminder: false,
  defaultExportDirectory: app.getPath("downloads"),
  uiSoundsEnabled: true,
  uiMotionEnabled: true,
  snailPetEnabled: false,
  snailPetScale: 3,
  snailPetSpeed: "normal",
  snailPetInsetProfile: DEFAULT_SNAIL_PET_INSET_PROFILE,
  theme: "clean"
};

function clampReminderIntervalMinutes(value: number): number {
  return Math.max(1, Math.min(120, Math.round(value)));
}

function clampDefaultTargetMinutes(value: number): number {
  return Math.max(1, Math.min(12 * 60, Math.round(value)));
}

function clampCaptureDelaySeconds(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function clampReminderSnoozeMinutes(value: number): number {
  return Math.max(1, Math.min(30, Math.round(value)));
}

function clampReflectDailyGoalMinutes(value: number): number {
  return Math.max(1, Math.min(24 * 60, Math.round(value)));
}

function normalizeStartupDashboardBehavior(value: unknown): AppSettings["startupDashboardBehavior"] {
  return value === "show_dashboard" ? "show_dashboard" : "tray_only";
}

function normalizeDirectory(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || app.getPath("downloads");
}

function normalizeSnailPetScale(value: unknown): AppSettings["snailPetScale"] {
  return value === 2 || value === 4 ? value : 3;
}

function normalizeSnailPetSpeed(value: unknown): AppSettings["snailPetSpeed"] {
  if (value === "snail_pace" || value === "low" || value === "fast" || value === "hyper") {
    return value;
  }

  if (value === "slow") {
    return "low";
  }

  return "normal";
}

type StoredSettings = Partial<AppSettings> & {
  snailPetEdgeInsetPx?: unknown;
};

export class SettingsService {
  private readonly store = new Store<AppSettings>({
    name: "settings",
    defaults: DEFAULT_SETTINGS
  });

  public initialize(): AppSettings {
    const settings = this.getSettings();
    this.applyLaunchAtLogin(settings.launchAtLogin);
    return settings;
  }

  public getSettings(): AppSettings {
    const stored = (this.store as any).store as StoredSettings;
    return {
      reminderIntervalMinutes: clampReminderIntervalMinutes(stored.reminderIntervalMinutes ?? DEFAULT_SETTINGS.reminderIntervalMinutes),
      defaultTargetMinutes: clampDefaultTargetMinutes(
        stored.defaultTargetMinutes ?? DEFAULT_SETTINGS.defaultTargetMinutes
      ),
      launchAtLogin: Boolean(stored.launchAtLogin ?? DEFAULT_SETTINGS.launchAtLogin),
      captureDelaySeconds: clampCaptureDelaySeconds(stored.captureDelaySeconds ?? DEFAULT_SETTINGS.captureDelaySeconds),
      reminderSnoozeMinutes: clampReminderSnoozeMinutes(
        stored.reminderSnoozeMinutes ?? DEFAULT_SETTINGS.reminderSnoozeMinutes
      ),
      reflectDailyGoalMinutes: clampReflectDailyGoalMinutes(
        stored.reflectDailyGoalMinutes ?? DEFAULT_SETTINGS.reflectDailyGoalMinutes
      ),
      startupDashboardBehavior: normalizeStartupDashboardBehavior(
        stored.startupDashboardBehavior ?? DEFAULT_SETTINGS.startupDashboardBehavior
      ),
      openDashboardOnReminder: Boolean(
        stored.openDashboardOnReminder ?? DEFAULT_SETTINGS.openDashboardOnReminder
      ),
      defaultExportDirectory: normalizeDirectory(
        stored.defaultExportDirectory ?? DEFAULT_SETTINGS.defaultExportDirectory
      ),
      uiSoundsEnabled: Boolean(stored.uiSoundsEnabled ?? DEFAULT_SETTINGS.uiSoundsEnabled),
      uiMotionEnabled: Boolean(stored.uiMotionEnabled ?? DEFAULT_SETTINGS.uiMotionEnabled),
      snailPetEnabled: Boolean(stored.snailPetEnabled ?? DEFAULT_SETTINGS.snailPetEnabled),
      snailPetScale: normalizeSnailPetScale(stored.snailPetScale ?? DEFAULT_SETTINGS.snailPetScale),
      snailPetSpeed: normalizeSnailPetSpeed(stored.snailPetSpeed ?? DEFAULT_SETTINGS.snailPetSpeed),
      snailPetInsetProfile: migrateSnailPetInsetProfile(
        stored.snailPetInsetProfile,
        stored.snailPetEdgeInsetPx
      ),
      theme: "clean"
    };
  }

  public setSettings(input: UpdateSettingsInput): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = {
      ...current,
      ...input,
      reminderIntervalMinutes:
        input.reminderIntervalMinutes !== undefined
          ? clampReminderIntervalMinutes(input.reminderIntervalMinutes)
          : current.reminderIntervalMinutes,
      defaultTargetMinutes:
        input.defaultTargetMinutes !== undefined
          ? clampDefaultTargetMinutes(input.defaultTargetMinutes)
          : current.defaultTargetMinutes,
      launchAtLogin:
        input.launchAtLogin !== undefined ? Boolean(input.launchAtLogin) : current.launchAtLogin,
      captureDelaySeconds:
        input.captureDelaySeconds !== undefined
          ? clampCaptureDelaySeconds(input.captureDelaySeconds)
          : current.captureDelaySeconds,
      reminderSnoozeMinutes:
        input.reminderSnoozeMinutes !== undefined
          ? clampReminderSnoozeMinutes(input.reminderSnoozeMinutes)
          : current.reminderSnoozeMinutes,
      reflectDailyGoalMinutes:
        input.reflectDailyGoalMinutes !== undefined
          ? clampReflectDailyGoalMinutes(input.reflectDailyGoalMinutes)
          : current.reflectDailyGoalMinutes,
      startupDashboardBehavior:
        input.startupDashboardBehavior !== undefined
          ? normalizeStartupDashboardBehavior(input.startupDashboardBehavior)
          : current.startupDashboardBehavior,
      openDashboardOnReminder:
        input.openDashboardOnReminder !== undefined
          ? Boolean(input.openDashboardOnReminder)
          : current.openDashboardOnReminder,
      defaultExportDirectory:
        input.defaultExportDirectory !== undefined
          ? normalizeDirectory(input.defaultExportDirectory)
          : current.defaultExportDirectory,
      uiSoundsEnabled:
        input.uiSoundsEnabled !== undefined ? Boolean(input.uiSoundsEnabled) : current.uiSoundsEnabled,
      uiMotionEnabled:
        input.uiMotionEnabled !== undefined ? Boolean(input.uiMotionEnabled) : current.uiMotionEnabled,
      snailPetEnabled:
        input.snailPetEnabled !== undefined ? Boolean(input.snailPetEnabled) : current.snailPetEnabled,
      snailPetScale:
        input.snailPetScale !== undefined
          ? normalizeSnailPetScale(input.snailPetScale)
          : current.snailPetScale,
      snailPetSpeed:
        input.snailPetSpeed !== undefined
          ? normalizeSnailPetSpeed(input.snailPetSpeed)
          : current.snailPetSpeed,
      snailPetInsetProfile:
        input.snailPetInsetProfile !== undefined
          ? normalizeSnailPetInsetProfile(input.snailPetInsetProfile)
          : current.snailPetInsetProfile,
      theme: "clean"
    };

    (this.store as any).store = next;
    this.applyLaunchAtLogin(next.launchAtLogin);
    logInfo("Updated application settings.", next);
    return next;
  }

  private applyLaunchAtLogin(openAtLogin: boolean): void {
    app.setLoginItemSettings({
      openAtLogin
    });
  }
}
