import { Menu, Tray, nativeImage } from "electron";
import { getAppState, patchAppState } from "./app-state";
import { resolveAppAssetPath } from "./asset-paths";

type TrayManagerOptions = {
  onToggleDashboard: () => void | Promise<void>;
  onShowDashboard: () => void | Promise<void>;
  onStartSession: () => void | Promise<void>;
  onPauseSession: () => void | Promise<void>;
  onResumeSession: () => void | Promise<void>;
  onTakeScreenshot: () => void | Promise<void>;
  onCompleteSession: () => void | Promise<void>;
  onCancelSession: () => void | Promise<void>;
  onQuit: () => void | Promise<void>;
};

let tray: Tray | null = null;

function buildTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveAppAssetPath("sessiontrail-tray-icon.png"));
  if (icon.isEmpty()) {
    return icon;
  }

  return icon.resize({
    width: 32,
    height: 32,
    quality: "best"
  });
}

function buildContextMenu(options: TrayManagerOptions): Electron.Menu {
  const state = getAppState();
  const toggleLabel =
    state.dashboardVisibility === "visible" ? "Hide dashboard" : "Show dashboard";
  const activeSession = state.activeSession;
  const pendingRecovery = state.pendingRecovery;
  const pendingReminderPrompt = state.pendingReminderPrompt;
  const pendingCheckpoint = state.pendingCheckpoint;
  const sessionStatusLabel = activeSession ? activeSession.status : "idle";

  return Menu.buildFromTemplate([
    {
      label: `Session: ${sessionStatusLabel}`,
      enabled: false
    },
    {
      label: activeSession ? activeSession.title : "No session",
      enabled: false
    },
    {
      type: "separator"
    },
    {
      label: "Start session",
      enabled: !activeSession && !pendingRecovery && !pendingCheckpoint,
      click: () => {
        void options.onStartSession();
      }
    },
    {
      label: "Pause session",
      enabled: activeSession?.status === "active" && !pendingRecovery && !pendingCheckpoint && !pendingReminderPrompt,
      click: () => {
        void options.onPauseSession();
      }
    },
    {
      label: "Resume session",
      enabled: activeSession?.status === "paused" && !pendingRecovery && !pendingCheckpoint && !pendingReminderPrompt,
      click: () => {
        void options.onResumeSession();
      }
    },
    {
      label: "Take Screenshot",
      enabled: Boolean(activeSession) && !pendingRecovery && !pendingCheckpoint,
      click: () => {
        void options.onTakeScreenshot();
      }
    },
    {
      label: "Complete session",
      enabled: Boolean(activeSession) && !pendingRecovery && !pendingCheckpoint && !pendingReminderPrompt,
      click: () => {
        void options.onCompleteSession();
      }
    },
    {
      label: "Cancel session",
      enabled: Boolean(activeSession) && !pendingRecovery && !pendingCheckpoint && !pendingReminderPrompt,
      click: () => {
        void options.onCancelSession();
      }
    },
    ...(pendingRecovery
      ? [
          {
            type: "separator" as const
          },
          {
            label: `Recovery pending: ${pendingRecovery.session.title}`,
            enabled: false
          }
        ]
      : []),
    ...(pendingCheckpoint
      ? [
          {
            type: "separator" as const
          },
          {
            label: `Checkpoint note pending`,
            enabled: false
          }
        ]
      : []),
    {
      type: "separator"
    },
    {
      label: toggleLabel,
      click: () => {
        void options.onToggleDashboard();
      }
    },
    {
      label: "Open dashboard",
      click: () => {
        void options.onShowDashboard();
      }
    },
    {
      type: "separator"
    },
    {
      label: "Quit SessionTrail",
      click: () => {
        void options.onQuit();
      }
    }
  ]);
}

export function createTray(options: TrayManagerOptions): Tray {
  if (tray) {
    return tray;
  }

  tray = new Tray(buildTrayIcon());
  tray.setToolTip("SessionTrail");
  tray.setContextMenu(buildContextMenu(options));
  tray.on("click", () => {
    void options.onToggleDashboard();
  });

  patchAppState({ trayReady: true });

  return tray;
}

export function refreshTrayMenu(options: TrayManagerOptions): void {
  if (!tray) {
    return;
  }

  tray.setContextMenu(buildContextMenu(options));
}
