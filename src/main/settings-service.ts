import Store from "electron-store";
import { app } from "electron";
import type { AppSettings, UpdateSettingsInput } from "../shared/contracts";
import { logInfo } from "./logger";

const DEFAULT_SETTINGS: AppSettings = {
  reminderIntervalMinutes: 10,
  defaultTargetMinutes: 120,
  launchAtLogin: false,
  captureDelaySeconds: 2,
  reminderSnoozeMinutes: 1,
  startupDashboardBehavior: "tray_only",
  openDashboardOnReminder: false,
  defaultExportDirectory: app.getPath("downloads"),
  uiSoundsEnabled: true,
  uiMotionEnabled: true,
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

function normalizeStartupDashboardBehavior(value: unknown): AppSettings["startupDashboardBehavior"] {
  return value === "show_dashboard" ? "show_dashboard" : "tray_only";
}

function normalizeDirectory(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || app.getPath("downloads");
}

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
    const stored = (this.store as any).store as Partial<AppSettings>;
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
