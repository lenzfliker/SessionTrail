import { BrowserWindow } from "electron";
import { join } from "node:path";
import type { AppState } from "../shared/contracts";
import { getAppState, patchAppState } from "./app-state";
import { resolveAppAssetPath } from "./asset-paths";
import { logError, logWarn } from "./logger";
import { startRendererServer } from "./renderer-server";

let dashboardWindow: BrowserWindow | null = null;
let allowWindowClose = false;

async function loadDashboardContents(window: BrowserWindow): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  const packagedUrl = await startRendererServer();
  await window.loadURL(packagedUrl);
}

export async function createDashboardWindow(): Promise<BrowserWindow> {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    return dashboardWindow;
  }

  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    show: false,
    title: "SessionTrail",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    icon: resolveAppAssetPath("sessiontrail-app-icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#111827",
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true
    }
  });

  dashboardWindow.on("show", () => {
    patchAppState({ dashboardVisibility: "visible" });
  });

  dashboardWindow.on("hide", () => {
    patchAppState({ dashboardVisibility: "hidden" });
  });

  dashboardWindow.on("enter-full-screen", () => {
    patchAppState({ dashboardFullscreen: true });
  });

  dashboardWindow.on("leave-full-screen", () => {
    patchAppState({ dashboardFullscreen: false });
  });

  dashboardWindow.on("close", (event) => {
    if (allowWindowClose) {
      return;
    }

    event.preventDefault();
    dashboardWindow?.hide();
  });

  dashboardWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("Dashboard renderer process exited.", details);
    patchAppState({ lastErrorMessage: "Dashboard renderer crashed. Reloading window." });
    void loadDashboardContents(dashboardWindow!);
  });

  dashboardWindow.webContents.on("unresponsive", () => {
    logWarn("Dashboard renderer became unresponsive.");
    patchAppState({ lastErrorMessage: "Dashboard window became unresponsive." });
  });

  dashboardWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logError("Dashboard contents failed to load.", {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

  dashboardWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logError("Dashboard preload failed.", {
      preloadPath,
      error
    });
  });

  await loadDashboardContents(dashboardWindow);
  patchAppState({ dashboardFullscreen: dashboardWindow.isFullScreen() });

  return dashboardWindow;
}

export function getDashboardWindow(): BrowserWindow | null {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    return null;
  }

  return dashboardWindow;
}

export function showDashboardWindow(): AppState {
  const window = getDashboardWindow();
  if (!window) {
    return getAppState();
  }

  window.show();
  window.focus();
  return getAppState();
}

export function hideDashboardWindow(): AppState {
  const window = getDashboardWindow();
  if (!window) {
    return getAppState();
  }

  window.hide();
  return getAppState();
}

export function toggleDashboardWindow(): AppState {
  const window = getDashboardWindow();
  if (!window) {
    return getAppState();
  }

  if (window.isVisible()) {
    window.hide();
  } else {
    window.show();
    window.focus();
  }

  return getAppState();
}

export function prepareForQuit(): void {
  allowWindowClose = true;
  dashboardWindow?.destroy();
  dashboardWindow = null;
}
