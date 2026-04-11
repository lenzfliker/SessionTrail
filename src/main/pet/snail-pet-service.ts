import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSettings,
  SnailPetBehaviorState,
  SnailPetRuntimeSummary,
  SnailPetSpeed
} from "../../shared/contracts";
import {
  type PetEdge,
  type RectLike,
  type TravelDirection,
  getDefaultTrackOffset,
  getHostPaddingPx,
  getHostWindowSize,
  getPerimeterLength,
  getSpriteSizePx,
  getTrackOffsetFromLegacyPosition,
  getVisualAnchor,
  getVisualTransform,
  getWindowOriginForContactPoint,
  normalizeTrackOffset,
  resolveTrackPosition,
  resolveTrackPositionForDirection
} from "../../shared/snail-pet-geometry";
import { patchAppState } from "../app-state";
import { logError } from "../logger";
import { startRendererServer } from "../renderer-server";

type PersistedPetState = {
  visible: boolean;
  paused: boolean;
  direction: TravelDirection;
  trackOffsetPx: number;
  state: SnailPetBehaviorState;
};

type LegacyPersistedPetState = {
  visible?: boolean;
  paused?: boolean;
  edge?: PetEdge;
  direction?: TravelDirection;
  x?: number;
  y?: number;
  state?: SnailPetBehaviorState;
};

type WeightedState = {
  state: SnailPetBehaviorState;
  weight: number;
};

type RuntimeConfig = {
  renderScale: AppSettings["snailPetScale"];
  windowSize: number;
  spriteSizePx: number;
  hostPaddingPx: number;
  moveSpeedPerTick: number;
  frameDurationMs: number;
  cornerContinueChance: number;
  idleDurationRangeMs: readonly [number, number];
  moveDurationRangeMs: readonly [number, number];
  workDurationRangeMs: readonly [number, number];
  moveDecisionRangeMs: readonly [number, number];
  transitionWeights: readonly WeightedState[];
};

type TrackPlacement = {
  edge: PetEdge;
  contactX: number;
  contactY: number;
  windowX: number;
  windowY: number;
  windowSize: number;
  spriteSizePx: number;
  hostPaddingPx: number;
};

const TICK_INTERVAL_MS = 50;
const MAX_TICK_DELTA_MS = 250;
const PREFS_FILE_NAME = "snail-pet.json";
const PET_VISUAL_STATE_CHANNEL = "snail-pet:visual-state";
const CORNER_CONTINUE_BEFORE_FULL_CIRCUIT = 0.92;
const POSITION_PERSIST_INTERVAL_MS = 1_000;
const PET_ALWAYS_ON_TOP_LEVEL: Parameters<BrowserWindow["setAlwaysOnTop"]>[1] = "screen-saver";

const EDGE_BIT: Record<PetEdge, number> = { bottom: 1, left: 2, top: 4, right: 8 };
const ALL_EDGES_VISITED = 0xf;

const SPEED_PRESETS: Record<
  SnailPetSpeed,
  {
    moveSpeedPerTick: number;
    frameDurationMs: number;
  }
> = {
  snail_pace: {
    moveSpeedPerTick: 0.5,
    frameDurationMs: 400
  },
  low: {
    moveSpeedPerTick: 1,
    frameDurationMs: 200
  },
  normal: {
    moveSpeedPerTick: 2,
    frameDurationMs: 100
  },
  fast: {
    moveSpeedPerTick: 4,
    frameDurationMs: 50
  },
  hyper: {
    moveSpeedPerTick: 8,
    frameDurationMs: 25
  }
};

const DEFAULT_TRANSITION_WEIGHTS: readonly WeightedState[] = [
  { state: "idle", weight: 0.33 },
  { state: "move", weight: 0.33 },
  { state: "work", weight: 0.34 }
];

function clampDirection(value: unknown): TravelDirection {
  return value === -1 ? -1 : 1;
}

function clampEdge(value: unknown): PetEdge {
  return value === "top" || value === "right" || value === "left" ? value : "bottom";
}

function clampBehaviorState(value: unknown): SnailPetBehaviorState {
  return value === "move" || value === "work" ? value : "idle";
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeightedState(entries: readonly WeightedState[]): SnailPetBehaviorState {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const threshold = Math.random() * totalWeight;
  let runningWeight = 0;

  for (const entry of entries) {
    runningWeight += entry.weight;
    if (threshold <= runningWeight) {
      return entry.state;
    }
  }

  return entries.at(-1)?.state ?? "idle";
}

function getEntryUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/pet.html`;
}

function roundRect(rect: RectLike): Rectangle {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

export class SnailPetService {
  private readonly prefsPath = join(app.getPath("userData"), PREFS_FILE_NAME);
  private readonly savedPrefs = this.loadPrefs();
  private readonly handleDisplayChange = () => {
    const currentDisplayBounds = this.getPrimaryDisplayBounds();
    const previousPerimeter = getPerimeterLength(this.lastDisplayBounds);
    const currentPerimeter = getPerimeterLength(currentDisplayBounds);

    if (previousPerimeter > 0 && currentPerimeter > 0) {
      const normalizedOffset = normalizeTrackOffset(this.trackOffsetPx, previousPerimeter);
      this.trackOffsetPx = normalizeTrackOffset(
        (normalizedOffset / previousPerimeter) * currentPerimeter,
        currentPerimeter
      );
    } else {
      this.trackOffsetPx = getDefaultTrackOffset(currentDisplayBounds);
    }

    this.lastDisplayBounds = currentDisplayBounds;
    this.edgeVisitMask |= EDGE_BIT[this.getCurrentMotionEdge(currentDisplayBounds)];

    if (this.window && !this.window.isDestroyed()) {
      this.syncWindowToTrackPosition(currentDisplayBounds);
      this.pushVisualState();
    }

    this.savePrefs();
  };

  private window: BrowserWindow | null = null;
  private settings: AppSettings | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private behaviorEndsAt = 0;
  private nextMoveDecisionAt = 0;
  private lastTickAt = 0;
  private idleStreak = 0;
  private lastRuntimeState: SnailPetRuntimeSummary | null = null;
  private hasAppliedSettings = false;
  private lastPrefsSavedAt = 0;
  private lastDisplayBounds = this.getPrimaryDisplayBounds();
  private edgeVisitMask = 0;
  private behaviorState: SnailPetBehaviorState = this.savedPrefs?.state ?? "idle";
  private direction: TravelDirection = this.savedPrefs?.direction ?? 1;
  private visible = this.savedPrefs?.visible ?? true;
  private paused = this.savedPrefs?.paused ?? false;
  private trackOffsetPx = this.savedPrefs?.trackOffsetPx ?? getDefaultTrackOffset(this.lastDisplayBounds);

  public constructor() {
    this.trackOffsetPx = normalizeTrackOffset(this.trackOffsetPx, getPerimeterLength(this.lastDisplayBounds));
    screen.on("display-added", this.handleDisplayChange);
    screen.on("display-removed", this.handleDisplayChange);
    screen.on("display-metrics-changed", this.handleDisplayChange);
    this.edgeVisitMask = EDGE_BIT[this.getCurrentMotionEdge(this.lastDisplayBounds)];
    this.patchRuntimeState();
  }

  public async applySettings(settings: AppSettings): Promise<void> {
    const previousSettings = this.settings;
    const wasEnabled = previousSettings?.snailPetEnabled ?? false;
    const isFirstApply = !this.hasAppliedSettings;
    this.settings = settings;
    this.hasAppliedSettings = true;

    if (!settings.snailPetEnabled) {
      this.stopTicking();
      this.savePrefs();
      this.destroyWindow();
      this.patchRuntimeState();
      return;
    }

    if (!isFirstApply && !wasEnabled) {
      this.visible = true;
      this.paused = false;
    }

    this.lastDisplayBounds = this.getPrimaryDisplayBounds();
    this.trackOffsetPx = normalizeTrackOffset(this.trackOffsetPx, getPerimeterLength(this.lastDisplayBounds));
    this.edgeVisitMask |= EDGE_BIT[this.getCurrentMotionEdge(this.lastDisplayBounds)];

    await this.ensureWindow();
    this.resizeWindowToScale();
    this.ensureBehaviorWindow();
    this.pushVisualState();
    this.syncVisibility();
    this.syncTicking();
    this.patchRuntimeState();
    this.savePrefs();
  }

  public async show(): Promise<void> {
    if (!this.settings?.snailPetEnabled) {
      return;
    }

    await this.ensureWindow();
    this.visible = true;
    this.syncVisibility();
    this.syncTicking();
    this.patchRuntimeState();
    this.savePrefs();
  }

  public hide(): void {
    this.visible = false;
    this.window?.hide();
    this.stopTicking();
    this.patchRuntimeState();
    this.savePrefs();
  }

  public pause(): void {
    if (!this.settings?.snailPetEnabled) {
      return;
    }

    this.paused = true;
    this.stopTicking();
    this.patchRuntimeState();
    this.savePrefs();
  }

  public resume(): void {
    if (!this.settings?.snailPetEnabled) {
      return;
    }

    this.paused = false;
    this.ensureBehaviorWindow();
    this.syncTicking();
    this.patchRuntimeState();
    this.savePrefs();
  }

  public dispose(): void {
    screen.off("display-added", this.handleDisplayChange);
    screen.off("display-removed", this.handleDisplayChange);
    screen.off("display-metrics-changed", this.handleDisplayChange);
    this.stopTicking();
    this.savePrefs();
    this.destroyWindow();
  }

  private getRuntimeConfig(): RuntimeConfig {
    const renderScale = this.settings?.snailPetScale ?? 3;
    const speedPreset = SPEED_PRESETS[this.settings?.snailPetSpeed ?? "normal"];
    const spriteSizePx = getSpriteSizePx(renderScale);
    const hostPaddingPx = getHostPaddingPx(renderScale);

    return {
      renderScale,
      windowSize: getHostWindowSize(renderScale),
      spriteSizePx,
      hostPaddingPx,
      moveSpeedPerTick: speedPreset.moveSpeedPerTick,
      frameDurationMs: speedPreset.frameDurationMs,
      cornerContinueChance: 0.65,
      idleDurationRangeMs: [1_200, 3_200],
      moveDurationRangeMs: [1_400, 3_200],
      workDurationRangeMs: [1_200, 2_800],
      moveDecisionRangeMs: [700, 1_800],
      transitionWeights: DEFAULT_TRANSITION_WEIGHTS
    };
  }

  private getPrimaryDisplayBounds(): Rectangle {
    return roundRect(screen.getPrimaryDisplay().bounds);
  }

  private getCurrentMotionEdge(bounds = this.getPrimaryDisplayBounds()): PetEdge {
    return resolveTrackPositionForDirection(this.trackOffsetPx, bounds, this.direction).edge;
  }

  private getTrackPlacement(bounds = this.getPrimaryDisplayBounds()): TrackPlacement {
    const config = this.getRuntimeConfig();
    const contactPosition = resolveTrackPosition(this.trackOffsetPx, bounds);
    const motionPosition = resolveTrackPositionForDirection(this.trackOffsetPx, bounds, this.direction);
    const edgeInsetPx =
      this.settings?.snailPetInsetProfile[this.settings.snailPetScale] ??
      this.settings?.snailPetInsetProfile[3] ??
      15;
    const insetContactPoint =
      motionPosition.edge === "top"
        ? { x: contactPosition.contactX, y: contactPosition.contactY + edgeInsetPx }
        : motionPosition.edge === "right"
          ? { x: contactPosition.contactX - edgeInsetPx, y: contactPosition.contactY }
          : motionPosition.edge === "bottom"
            ? { x: contactPosition.contactX, y: contactPosition.contactY - edgeInsetPx }
            : { x: contactPosition.contactX + edgeInsetPx, y: contactPosition.contactY };
    const anchor = getVisualAnchor(
      motionPosition.edge,
      this.direction,
      config.renderScale,
      config.hostPaddingPx
    );
    const windowOrigin = getWindowOriginForContactPoint(insetContactPoint, anchor);

    return {
      edge: motionPosition.edge,
      contactX: insetContactPoint.x,
      contactY: insetContactPoint.y,
      windowX: windowOrigin.x,
      windowY: windowOrigin.y,
      windowSize: config.windowSize,
      spriteSizePx: config.spriteSizePx,
      hostPaddingPx: config.hostPaddingPx
    };
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const initialBounds = this.getInitialBounds();
    const preloadPath = join(__dirname, "..", "..", "preload", "pet-preload.js");

    this.window = new BrowserWindow({
      width: initialBounds.width,
      height: initialBounds.height,
      x: initialBounds.x,
      y: initialBounds.y,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      focusable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    this.window.setAlwaysOnTop(true, PET_ALWAYS_ON_TOP_LEVEL, 1);
    this.window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    this.window.setIgnoreMouseEvents(true, { forward: true });

    this.window.on("closed", () => {
      this.window = null;
    });

    this.window.webContents.on("did-finish-load", () => {
      this.pushVisualState();
      this.syncVisibility();
    });

    this.window.webContents.on("render-process-gone", (_event, details) => {
      logError("Snail pet renderer exited unexpectedly.", details);
      if (this.window && !this.window.isDestroyed()) {
        void this.loadPetContents(this.window).catch((error) => {
          logError("Failed to reload snail pet renderer.", error);
        });
      }
    });

    await this.loadPetContents(this.window);
    this.syncWindowToTrackPosition();
    return this.window;
  }

  private async loadPetContents(window: BrowserWindow): Promise<void> {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      await window.loadURL(getEntryUrl(devServerUrl));
      return;
    }

    const packagedUrl = await startRendererServer();
    await window.loadURL(getEntryUrl(packagedUrl));
  }

  private resizeWindowToScale(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const nextSize = this.getRuntimeConfig().windowSize;
    const currentBounds = this.window.getBounds();
    if (currentBounds.width === nextSize && currentBounds.height === nextSize) {
      this.syncWindowToTrackPosition();
      return;
    }

    this.window.setBounds({
      ...currentBounds,
      width: nextSize,
      height: nextSize
    });
    this.syncWindowToTrackPosition();
    this.pushVisualState();
    this.savePrefs();
  }

  private getInitialBounds(): Rectangle {
    const placement = this.getTrackPlacement(this.lastDisplayBounds);
    return {
      x: Math.round(placement.windowX),
      y: Math.round(placement.windowY),
      width: placement.windowSize,
      height: placement.windowSize
    };
  }

  private syncVisibility(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    if (this.visible) {
      this.window.showInactive();
      this.window.moveTop();
      return;
    }

    this.window.hide();
  }

  private syncTicking(): void {
    if (this.settings?.snailPetEnabled && this.visible && !this.paused) {
      if (this.tickTimer) {
        return;
      }

      this.lastTickAt = Date.now();
      this.tickTimer = setInterval(() => {
        this.tick();
      }, TICK_INTERVAL_MS);
      return;
    }

    this.stopTicking();
  }

  private stopTicking(): void {
    if (!this.tickTimer) {
      return;
    }

    clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.lastTickAt = 0;
  }

  private tick(): void {
    if (!this.window || this.window.isDestroyed() || !this.settings?.snailPetEnabled) {
      this.stopTicking();
      return;
    }

    if (!this.visible || this.paused) {
      this.lastTickAt = Date.now();
      return;
    }

    const now = Date.now();
    const dtMs = Math.min(MAX_TICK_DELTA_MS, Math.max(0, now - this.lastTickAt));
    this.lastTickAt = now;

    this.tickBehavior(now);
    if (this.behaviorState === "move") {
      this.tickMoveVariation(now);
      const distance = this.getRuntimeConfig().moveSpeedPerTick * (dtMs / TICK_INTERVAL_MS);
      this.advanceMovement(distance, now);
    }
  }

  private tickBehavior(now: number): void {
    if (now < this.behaviorEndsAt) {
      return;
    }

    this.chooseNextBehavior(now);
  }

  private tickMoveVariation(now: number): void {
    if (this.behaviorState !== "move" || now < this.nextMoveDecisionAt) {
      return;
    }

    const circuitComplete = this.edgeVisitMask === ALL_EDGES_VISITED;
    const roll = Math.random();

    if (circuitComplete) {
      if (roll < 0.45) {
        this.direction = (this.direction * -1) as TravelDirection;
        this.scheduleNextMoveDecision(now);
        this.pushVisualState();
        this.savePrefs();
        return;
      }

      if (roll < 0.7) {
        this.applyBehaviorState("idle", now);
        return;
      }

      if (roll < 0.85) {
        this.applyBehaviorState("work", now);
        return;
      }

      this.scheduleNextMoveDecision(now);
      return;
    }

    if (roll < 0.15) {
      this.direction = (this.direction * -1) as TravelDirection;
      this.scheduleNextMoveDecision(now);
      this.pushVisualState();
      this.savePrefs();
      return;
    }

    if (roll < 0.35) {
      this.applyBehaviorState("idle", now);
      return;
    }

    if (roll < 0.45) {
      this.applyBehaviorState("work", now);
      return;
    }

    this.scheduleNextMoveDecision(now);
  }

  private ensureBehaviorWindow(): void {
    if (this.behaviorEndsAt > Date.now()) {
      return;
    }

    this.applyBehaviorState(this.behaviorState, Date.now());
  }

  private chooseNextBehavior(now: number): void {
    let entries = [...this.getRuntimeConfig().transitionWeights];

    if (this.behaviorState === "work") {
      entries = entries.filter((entry) => entry.state !== "work");
    }

    if (this.idleStreak >= 2) {
      entries = entries.map((entry) => {
        if (entry.state === "move") {
          return { ...entry, weight: entry.weight + 0.2 };
        }

        if (entry.state === "idle") {
          return { ...entry, weight: Math.max(0.05, entry.weight - 0.2) };
        }

        return entry;
      });
    }

    this.applyBehaviorState(pickWeightedState(entries), now);
  }

  private applyBehaviorState(nextState: SnailPetBehaviorState, now: number): void {
    this.behaviorState = nextState;
    this.idleStreak = nextState === "idle" ? this.idleStreak + 1 : 0;
    this.behaviorEndsAt = now + this.getBehaviorDurationMs(nextState);
    this.nextMoveDecisionAt = nextState === "move" ? this.getNextMoveDecisionAt(now) : 0;
    this.pushVisualState();
    this.patchRuntimeState();
    this.savePrefs();
  }

  private getBehaviorDurationMs(state: SnailPetBehaviorState): number {
    const config = this.getRuntimeConfig();
    const [min, max] =
      state === "move"
        ? config.moveDurationRangeMs
        : state === "work"
          ? config.workDurationRangeMs
          : config.idleDurationRangeMs;
    return randomBetween(min, max);
  }

  private getNextMoveDecisionAt(now: number): number {
    const [min, max] = this.getRuntimeConfig().moveDecisionRangeMs;
    return now + randomBetween(min, max);
  }

  private scheduleNextMoveDecision(now: number): void {
    this.nextMoveDecisionAt = this.getNextMoveDecisionAt(now);
  }

  private advanceMovement(distancePx: number, now: number): void {
    const bounds = this.lastDisplayBounds = this.getPrimaryDisplayBounds();
    const perimeterLength = getPerimeterLength(bounds);
    if (perimeterLength <= 0 || distancePx <= 0) {
      return;
    }

    let remainingDistance = distancePx;
    let guard = 0;
    const startingEdge = this.getCurrentMotionEdge(bounds);
    const startingDirection = this.direction;

    while (remainingDistance > 0.01 && guard < 16) {
      const current = resolveTrackPositionForDirection(this.trackOffsetPx, bounds, this.direction);
      this.edgeVisitMask |= EDGE_BIT[current.edge];

      const distanceToBoundary =
        this.direction > 0 ? current.edgeLength - current.progressOnEdge : current.progressOnEdge;

      if (remainingDistance <= distanceToBoundary + 0.001) {
        this.trackOffsetPx = normalizeTrackOffset(
          this.trackOffsetPx + remainingDistance * this.direction,
          perimeterLength
        );
        remainingDistance = 0;
        break;
      }

      this.trackOffsetPx = normalizeTrackOffset(
        this.trackOffsetPx + distanceToBoundary * this.direction,
        perimeterLength
      );
      remainingDistance -= distanceToBoundary;

      const circuitComplete = this.edgeVisitMask === ALL_EDGES_VISITED;
      const continueChance = circuitComplete
        ? this.getRuntimeConfig().cornerContinueChance
        : CORNER_CONTINUE_BEFORE_FULL_CIRCUIT;
      const shouldContinue = Math.random() < continueChance;

      if (!shouldContinue) {
        this.direction = (this.direction * -1) as TravelDirection;
      } else if (circuitComplete) {
        this.edgeVisitMask = 0;
      }

      guard += 1;
    }

    this.syncWindowToTrackPosition(bounds);

    const endingEdge = this.getCurrentMotionEdge(bounds);
    if (startingEdge !== endingEdge || startingDirection !== this.direction) {
      this.pushVisualState();
      this.savePrefs();
      return;
    }

    this.maybeSavePrefs(now);
  }

  private syncWindowToTrackPosition(bounds = this.getPrimaryDisplayBounds()): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const placement = this.getTrackPlacement(bounds);
    const currentBounds = this.window.getBounds();
    this.window.setBounds({
      ...currentBounds,
      x: Math.round(placement.windowX),
      y: Math.round(placement.windowY),
      width: placement.windowSize,
      height: placement.windowSize
    });
    if (this.visible) {
      this.window.moveTop();
    }
  }

  private pushVisualState(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const config = this.getRuntimeConfig();
    const edge = this.getCurrentMotionEdge(this.lastDisplayBounds);
    const visualTransform = getVisualTransform(edge, this.direction);
    this.window.webContents.send(PET_VISUAL_STATE_CHANNEL, {
      state: this.behaviorState,
      rotationDeg: visualTransform.rotationDeg,
      flipX: visualTransform.flipX,
      renderScale: config.renderScale,
      windowSize: config.windowSize,
      spriteSizePx: config.spriteSizePx,
      hostPaddingPx: config.hostPaddingPx,
      frameDurationMs: config.frameDurationMs
    });
  }

  private patchRuntimeState(): void {
    const nextRuntimeState: SnailPetRuntimeSummary = {
      visible: Boolean(this.settings?.snailPetEnabled) && this.visible,
      paused: Boolean(this.settings?.snailPetEnabled) && this.paused,
      behaviorState: this.settings?.snailPetEnabled ? this.behaviorState : null
    };

    if (
      this.lastRuntimeState &&
      this.lastRuntimeState.visible === nextRuntimeState.visible &&
      this.lastRuntimeState.paused === nextRuntimeState.paused &&
      this.lastRuntimeState.behaviorState === nextRuntimeState.behaviorState
    ) {
      return;
    }

    this.lastRuntimeState = nextRuntimeState;
    patchAppState({
      snailPet: nextRuntimeState
    });
  }

  private loadPrefs(): PersistedPetState | null {
    try {
      const parsed = JSON.parse(readFileSync(this.prefsPath, "utf8")) as Record<string, unknown>;
      const bounds = this.getPrimaryDisplayBounds();
      const perimeterLength = getPerimeterLength(bounds);

      if (Number.isFinite(parsed.trackOffsetPx)) {
        return {
          visible: parsed.visible !== false,
          paused: Boolean(parsed.paused),
          direction: clampDirection(parsed.direction),
          trackOffsetPx: normalizeTrackOffset(parsed.trackOffsetPx as number, perimeterLength),
          state: clampBehaviorState(parsed.state)
        };
      }

      const legacy = parsed as LegacyPersistedPetState;
      if (
        Number.isFinite(legacy.x) &&
        Number.isFinite(legacy.y) &&
        (legacy.edge === "top" || legacy.edge === "right" || legacy.edge === "bottom" || legacy.edge === "left")
      ) {
        return {
          visible: legacy.visible !== false,
          paused: Boolean(legacy.paused),
          direction: clampDirection(legacy.direction),
          trackOffsetPx: normalizeTrackOffset(
            getTrackOffsetFromLegacyPosition(
              clampEdge(legacy.edge),
              legacy.x as number,
              legacy.y as number,
              bounds
            ),
            perimeterLength
          ),
          state: clampBehaviorState(legacy.state)
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private maybeSavePrefs(now: number): void {
    if (now - this.lastPrefsSavedAt < POSITION_PERSIST_INTERVAL_MS) {
      return;
    }

    this.savePrefs();
  }

  private savePrefs(): void {
    try {
      const bounds = this.getPrimaryDisplayBounds();
      const payload: PersistedPetState = {
        visible: this.visible,
        paused: this.paused,
        direction: this.direction,
        trackOffsetPx: normalizeTrackOffset(this.trackOffsetPx, getPerimeterLength(bounds)),
        state: this.behaviorState
      };
      writeFileSync(this.prefsPath, JSON.stringify(payload, null, 2), "utf8");
      this.lastPrefsSavedAt = Date.now();
    } catch (error) {
      logError("Failed to save snail pet preferences.", error);
    }
  }

  private destroyWindow(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.window = null;
      return;
    }

    this.window.destroy();
    this.window = null;
  }
}
