import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSettings,
  SnailPetBehaviorState,
  SnailPetRuntimeSummary,
  SnailPetSpeed
} from "../../shared/contracts";
import { patchAppState } from "../app-state";
import { logError } from "../logger";
import { startRendererServer } from "../renderer-server";

type PetEdge = "top" | "right" | "bottom" | "left";
type TravelDirection = -1 | 1;
type PetCorner = "top_left" | "top_right" | "bottom_right" | "bottom_left";

type PersistedPetState = {
  visible: boolean;
  paused: boolean;
  edge: PetEdge;
  direction: TravelDirection;
  x: number;
  y: number;
  flipX?: boolean;
  state: SnailPetBehaviorState;
};

type WeightedState = {
  state: SnailPetBehaviorState;
  weight: number;
};

type PerimeterBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type Position = {
  x: number;
  y: number;
};

type EdgeTransition = {
  fromEdge: PetEdge;
  toEdge: PetEdge;
  phase: "exit" | "entry";
  corner: PetCorner;
  entryDirection: TravelDirection;
  targetX: number;
  targetY: number;
};

type RuntimeConfig = {
  renderScale: AppSettings["snailPetScale"];
  windowSize: number;
  moveSpeedPerTick: number;
  frameDurationMs: number;
  cornerContinueChance: number;
  idleDurationRangeMs: readonly [number, number];
  moveDurationRangeMs: readonly [number, number];
  workDurationRangeMs: readonly [number, number];
  moveDecisionRangeMs: readonly [number, number];
  transitionWeights: readonly WeightedState[];
};

const PET_WINDOW_FRAME_SIZE = 32;
const TICK_INTERVAL_MS = 50;
const MAX_TICK_DELTA_MS = 250;
const PREFS_FILE_NAME = "snail-pet.json";
const PET_VISUAL_STATE_CHANNEL = "snail-pet:visual-state";

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
  return value === 1 ? 1 : -1;
}

function clampEdge(value: unknown): PetEdge {
  return value === "top" || value === "right" || value === "left" ? value : "bottom";
}

function clampBehaviorState(value: unknown): SnailPetBehaviorState {
  return value === "move" || value === "work" ? value : "idle";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
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

function getScaleWindowSize(scale: AppSettings["snailPetScale"]): number {
  return PET_WINDOW_FRAME_SIZE * scale;
}

function getEntryUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/pet.html`;
}

function getVisualTransform(edge: PetEdge, direction: TravelDirection): {
  rotationDeg: number;
  flipX: boolean;
} {
  if (edge === "bottom") {
    return {
      rotationDeg: 0,
      flipX: direction < 0
    };
  }

  if (edge === "top") {
    return {
      rotationDeg: 180,
      flipX: direction > 0
    };
  }

  if (edge === "left") {
    return {
      rotationDeg: 90,
      flipX: direction < 0
    };
  }

  return {
    rotationDeg: -90,
    flipX: direction > 0
  };
}

function getCornerForEdge(edge: PetEdge, direction: TravelDirection): PetCorner {
  switch (edge) {
    case "top":
      return direction > 0 ? "top_right" : "top_left";
    case "right":
      return direction > 0 ? "bottom_right" : "top_right";
    case "bottom":
      return direction > 0 ? "bottom_right" : "bottom_left";
    case "left":
    default:
      return direction > 0 ? "bottom_left" : "top_left";
  }
}

function getAdjacentEdge(edge: PetEdge, direction: TravelDirection): {
  toEdge: PetEdge;
  entryDirection: TravelDirection;
} {
  switch (`${edge}:${direction}` as const) {
    case "top:1":
      return { toEdge: "right", entryDirection: 1 };
    case "top:-1":
      return { toEdge: "left", entryDirection: 1 };
    case "right:1":
      return { toEdge: "bottom", entryDirection: -1 };
    case "right:-1":
      return { toEdge: "top", entryDirection: -1 };
    case "bottom:1":
      return { toEdge: "right", entryDirection: -1 };
    case "bottom:-1":
      return { toEdge: "left", entryDirection: -1 };
    case "left:1":
      return { toEdge: "bottom", entryDirection: 1 };
    case "left:-1":
    default:
      return { toEdge: "top", entryDirection: 1 };
  }
}

function getPerimeterBounds(workArea: Rectangle, windowBounds: Rectangle): PerimeterBounds {
  const w = Math.round(windowBounds.width);
  const h = Math.round(windowBounds.height);
  return {
    left: workArea.x,
    top: workArea.y,
    right: workArea.x + workArea.width - w,
    bottom: workArea.y + workArea.height - h
  };
}

function getOffscreenExitTarget(
  edge: PetEdge,
  direction: TravelDirection,
  perimeter: PerimeterBounds,
  windowBounds: Rectangle
): Position {
  if (edge === "top") {
    return {
      x: direction > 0 ? perimeter.right + windowBounds.width : perimeter.left - windowBounds.width,
      y: perimeter.top
    };
  }

  if (edge === "bottom") {
    return {
      x: direction > 0 ? perimeter.right + windowBounds.width : perimeter.left - windowBounds.width,
      y: perimeter.bottom
    };
  }

  if (edge === "left") {
    return {
      x: perimeter.left,
      y: direction > 0 ? perimeter.bottom + windowBounds.height : perimeter.top - windowBounds.height
    };
  }

  return {
    x: perimeter.right,
    y: direction > 0 ? perimeter.bottom + windowBounds.height : perimeter.top - windowBounds.height
  };
}

function getEntryStartPosition(
  toEdge: PetEdge,
  entryDirection: TravelDirection,
  perimeter: PerimeterBounds,
  windowBounds: Rectangle
): Position {
  if (toEdge === "top") {
    return {
      x: entryDirection > 0 ? perimeter.left - windowBounds.width : perimeter.right + windowBounds.width,
      y: perimeter.top
    };
  }

  if (toEdge === "bottom") {
    return {
      x: entryDirection > 0 ? perimeter.left - windowBounds.width : perimeter.right + windowBounds.width,
      y: perimeter.bottom
    };
  }

  if (toEdge === "left") {
    return {
      x: perimeter.left,
      y: entryDirection > 0 ? perimeter.top - windowBounds.height : perimeter.bottom + windowBounds.height
    };
  }

  return {
    x: perimeter.right,
    y: entryDirection > 0 ? perimeter.top - windowBounds.height : perimeter.bottom + windowBounds.height
  };
}

function getEntryTarget(toEdge: PetEdge, entryDirection: TravelDirection, perimeter: PerimeterBounds): Position {
  if (toEdge === "top") {
    return {
      x: entryDirection > 0 ? perimeter.left : perimeter.right,
      y: perimeter.top
    };
  }

  if (toEdge === "bottom") {
    return {
      x: entryDirection > 0 ? perimeter.left : perimeter.right,
      y: perimeter.bottom
    };
  }

  if (toEdge === "left") {
    return {
      x: perimeter.left,
      y: entryDirection > 0 ? perimeter.top : perimeter.bottom
    };
  }

  return {
    x: perimeter.right,
    y: entryDirection > 0 ? perimeter.top : perimeter.bottom
  };
}


export class SnailPetService {
  private readonly prefsPath = join(app.getPath("userData"), PREFS_FILE_NAME);
  private readonly savedPrefs = this.loadPrefs();
  private readonly handleDisplayChange = () => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    this.transition = null;
    this.refreshCachedPerimeter();
    this.snapToPerimeter();
    this.pushVisualState();
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
  private transition: EdgeTransition | null = null;
  private hasAppliedSettings = false;
  private cachedPerimeter: PerimeterBounds | null = null;
  private edgeVisitMask = 0;
  private behaviorState: SnailPetBehaviorState = this.savedPrefs?.state ?? "idle";
  private edge: PetEdge = this.savedPrefs?.edge ?? "bottom";
  private direction: TravelDirection = this.savedPrefs?.direction ?? -1;
  private visible = this.savedPrefs?.visible ?? true;
  private paused = this.savedPrefs?.paused ?? false;
  private position: Position = {
    x: this.savedPrefs?.x ?? 0,
    y: this.savedPrefs?.y ?? 0
  };

  public constructor() {
    screen.on("display-added", this.handleDisplayChange);
    screen.on("display-removed", this.handleDisplayChange);
    screen.on("display-metrics-changed", this.handleDisplayChange);
    this.edgeVisitMask = EDGE_BIT[this.edge];
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
      this.transition = null;
      this.patchRuntimeState();
      return;
    }

    if (!isFirstApply && !wasEnabled) {
      this.visible = true;
      this.paused = false;
      this.transition = null;
    }

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

    return {
      renderScale,
      windowSize: getScaleWindowSize(renderScale),
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

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const windowSize = this.getRuntimeConfig().windowSize;
    const preloadPath = join(__dirname, "..", "..", "preload", "pet-preload.js");
    const initialBounds = this.getInitialBounds(windowSize);

    this.window = new BrowserWindow({
      width: windowSize,
      height: windowSize,
      x: Math.round(initialBounds.x),
      y: Math.round(initialBounds.y),
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
    this.refreshCachedPerimeter();
    this.snapToPerimeter();
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
      return;
    }

    this.transition = null;
    this.window.setBounds({
      ...currentBounds,
      width: nextSize,
      height: nextSize
    });
    this.refreshCachedPerimeter();
    this.snapToPerimeter();
    this.pushVisualState();
    this.savePrefs();
  }

  private getInitialBounds(windowSize: number): Rectangle {
    if (this.savedPrefs && Number.isFinite(this.savedPrefs.x) && Number.isFinite(this.savedPrefs.y)) {
      this.position = {
        x: this.savedPrefs.x,
        y: this.savedPrefs.y
      };
      return {
        x: this.savedPrefs.x,
        y: this.savedPrefs.y,
        width: windowSize,
        height: windowSize
      };
    }

    const workArea = screen.getPrimaryDisplay().workArea;
    this.position = {
      x: workArea.x + workArea.width - windowSize - 20,
      y: workArea.y + workArea.height - windowSize
    };
    return {
      x: this.position.x,
      y: this.position.y,
      width: windowSize,
      height: windowSize
    };
  }

  private syncVisibility(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    if (this.visible) {
      this.window.showInactive();
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

    if (this.behaviorState === "move" && !this.transition) {
      this.tickMoveVariation(now);
    }

    if (this.behaviorState === "move") {
      const distance = this.getRuntimeConfig().moveSpeedPerTick * (dtMs / TICK_INTERVAL_MS);
      this.advanceMovement(distance);
    }
  }

  private tickBehavior(now: number): void {
    if (this.transition || now < this.behaviorEndsAt) {
      return;
    }

    this.chooseNextBehavior(now);
  }

  private tickMoveVariation(now: number): void {
    if (this.behaviorState !== "move" || this.transition || now < this.nextMoveDecisionAt) {
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

  private advanceMovement(distancePx: number): void {
    let remainingDistance = distancePx;
    let guard = 0;

    while (remainingDistance > 0.01 && guard < 16) {
      remainingDistance = this.transition
        ? this.advanceTransition(remainingDistance)
        : this.advanceAlongEdge(remainingDistance);
      guard += 1;
    }
  }

  private advanceAlongEdge(distancePx: number): number {
    if (!this.window || this.window.isDestroyed()) {
      return 0;
    }

    this.edgeVisitMask |= EDGE_BIT[this.edge];
    const windowBounds = this.window.getBounds();
    const perimeter = this.getPerimeterForCurrentDisplay(windowBounds);
    const current = this.getVisibleEdgePosition(perimeter);
    if (Math.abs(current.x - this.position.x) > 0.001 || Math.abs(current.y - this.position.y) > 0.001) {
      this.setRawWindowPosition(current.x, current.y);
    }

    let nextX = current.x;
    let nextY = current.y;

    if (this.edge === "top" || this.edge === "bottom") {
      nextY = this.edge === "top" ? perimeter.top : perimeter.bottom;
      nextX = clampNumber(current.x + distancePx * this.direction, perimeter.left, perimeter.right);
      const usedDistance = Math.abs(nextX - current.x);
      this.setRawWindowPosition(nextX, nextY);
      const remainingDistance = Math.max(0, distancePx - usedDistance);

      if (Math.abs(nextX - (this.direction > 0 ? perimeter.right : perimeter.left)) <= 0.001) {
        this.resolveCornerTransition(perimeter, windowBounds);
      }

      return remainingDistance;
    }

    nextX = this.edge === "left" ? perimeter.left : perimeter.right;
    nextY = clampNumber(current.y + distancePx * this.direction, perimeter.top, perimeter.bottom);
    const usedDistance = Math.abs(nextY - current.y);
    this.setRawWindowPosition(nextX, nextY);
    const remainingDistance = Math.max(0, distancePx - usedDistance);

    if (Math.abs(nextY - (this.direction > 0 ? perimeter.bottom : perimeter.top)) <= 0.001) {
      this.resolveCornerTransition(perimeter, windowBounds);
    }

    return remainingDistance;
  }

  private resolveCornerTransition(perimeter: PerimeterBounds, windowBounds: Rectangle): void {
    const circuitComplete = this.edgeVisitMask === ALL_EDGES_VISITED;
    const continueChance = circuitComplete
      ? this.getRuntimeConfig().cornerContinueChance
      : 0.92;

    const shouldContinue = Math.random() < continueChance;
    if (!shouldContinue) {
      this.direction = (this.direction * -1) as TravelDirection;
      this.pushVisualState();
      this.savePrefs();
      return;
    }

    if (circuitComplete) {
      if (Math.random() < 0.5) {
        this.direction = (this.direction * -1) as TravelDirection;
      }
      this.edgeVisitMask = 0;
    }

    this.transition = this.createExitTransition(perimeter, windowBounds);
    this.savePrefs();
  }

  private createExitTransition(perimeter: PerimeterBounds, windowBounds: Rectangle): EdgeTransition {
    const corner = getCornerForEdge(this.edge, this.direction);
    const adjacent = getAdjacentEdge(this.edge, this.direction);
    const exitTarget = getOffscreenExitTarget(this.edge, this.direction, perimeter, windowBounds);

    return {
      fromEdge: this.edge,
      toEdge: adjacent.toEdge,
      phase: "exit",
      corner,
      entryDirection: adjacent.entryDirection,
      targetX: exitTarget.x,
      targetY: exitTarget.y
    };
  }

  private advanceTransition(distancePx: number): number {
    if (!this.transition || !this.window || this.window.isDestroyed()) {
      return 0;
    }

    const result = this.moveTowardTarget(distancePx, {
      x: this.transition.targetX,
      y: this.transition.targetY
    });

    if (!result.reachedTarget) {
      return result.remainingDistance;
    }

    if (this.transition.phase === "exit") {
      this.beginEntryTransition();
      return result.remainingDistance;
    }

    this.transition = null;
    this.edgeVisitMask |= EDGE_BIT[this.edge];
    this.snapToPerimeter();
    this.pushVisualState();
    this.savePrefs();
    return result.remainingDistance;
  }

  private beginEntryTransition(): void {
    if (!this.transition || !this.window || this.window.isDestroyed()) {
      return;
    }

    const windowBounds = this.window.getBounds();
    const perimeter = this.cachedPerimeter ?? this.refreshCachedPerimeter();
    const entryStart = getEntryStartPosition(
      this.transition.toEdge,
      this.transition.entryDirection,
      perimeter,
      windowBounds
    );
    const entryTarget = getEntryTarget(
      this.transition.toEdge,
      this.transition.entryDirection,
      perimeter
    );

    this.edge = this.transition.toEdge;
    this.direction = this.transition.entryDirection;
    this.setRawWindowPosition(entryStart.x, entryStart.y);
    this.transition = {
      ...this.transition,
      phase: "entry",
      targetX: entryTarget.x,
      targetY: entryTarget.y
    };
    this.pushVisualState();
    this.savePrefs();
  }

  private moveTowardTarget(distancePx: number, target: Position): {
    remainingDistance: number;
    reachedTarget: boolean;
  } {
    const deltaX = target.x - this.position.x;
    const deltaY = target.y - this.position.y;

    if (Math.abs(deltaX) > 0.001) {
      const stepX = Math.sign(deltaX) * Math.min(Math.abs(deltaX), distancePx);
      const nextX = this.position.x + stepX;
      this.setRawWindowPosition(nextX, this.position.y);
      return {
        remainingDistance: distancePx - Math.abs(stepX),
        reachedTarget: Math.abs(deltaX) <= distancePx + 0.001
      };
    }

    if (Math.abs(deltaY) > 0.001) {
      const stepY = Math.sign(deltaY) * Math.min(Math.abs(deltaY), distancePx);
      const nextY = this.position.y + stepY;
      this.setRawWindowPosition(this.position.x, nextY);
      return {
        remainingDistance: distancePx - Math.abs(stepY),
        reachedTarget: Math.abs(deltaY) <= distancePx + 0.001
      };
    }

    this.setRawWindowPosition(target.x, target.y);
    return {
      remainingDistance: distancePx,
      reachedTarget: true
    };
  }

  private getVisibleEdgePosition(perimeter: PerimeterBounds): Position {
    const x = clampNumber(this.position.x, perimeter.left, perimeter.right);
    const y = clampNumber(this.position.y, perimeter.top, perimeter.bottom);

    if (this.edge === "top") {
      return { x, y: perimeter.top };
    }

    if (this.edge === "bottom") {
      return { x, y: perimeter.bottom };
    }

    if (this.edge === "left") {
      return { x: perimeter.left, y };
    }

    return { x: perimeter.right, y };
  }

  private refreshCachedPerimeter(): PerimeterBounds {
    const windowSize = this.getRuntimeConfig().windowSize;
    const bounds = this.window?.getBounds() ?? {
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      width: windowSize,
      height: windowSize
    };
    this.cachedPerimeter = getPerimeterBounds(this.getCurrentWorkArea(bounds), bounds);
    return this.cachedPerimeter;
  }

  private getPerimeterForCurrentDisplay(_windowBounds?: Rectangle): PerimeterBounds {
    return this.cachedPerimeter ?? this.refreshCachedPerimeter();
  }

  private getCurrentWorkArea(bounds?: Rectangle): Rectangle {
    const activeBounds =
      bounds ??
      this.window?.getBounds() ?? {
        x: Math.round(this.position.x),
        y: Math.round(this.position.y),
        width: this.getRuntimeConfig().windowSize,
        height: this.getRuntimeConfig().windowSize
      };

    const point = {
      x: activeBounds.x + Math.floor(activeBounds.width / 2),
      y: activeBounds.y + Math.floor(activeBounds.height / 2)
    };
    return screen.getDisplayNearestPoint(point).workArea;
  }

  private snapToPerimeter(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const perimeter = this.getPerimeterForCurrentDisplay(this.window.getBounds());
    const visiblePosition = this.getVisibleEdgePosition(perimeter);
    this.setRawWindowPosition(visiblePosition.x, visiblePosition.y);
  }

  private setRawWindowPosition(x: number, y: number): void {
    this.position = { x, y };

    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const bounds = this.window.getBounds();
    this.window.setBounds({
      ...bounds,
      x: Math.round(x),
      y: Math.round(y)
    });
  }

  private pushVisualState(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const config = this.getRuntimeConfig();
    const visualTransform = getVisualTransform(this.edge, this.direction);
    this.window.webContents.send(PET_VISUAL_STATE_CHANNEL, {
      state: this.behaviorState,
      rotationDeg: visualTransform.rotationDeg,
      flipX: visualTransform.flipX,
      renderScale: config.renderScale,
      windowSize: config.windowSize,
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
      const parsed = JSON.parse(readFileSync(this.prefsPath, "utf8")) as Partial<PersistedPetState>;
      if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
        return null;
      }

      return {
        visible: parsed.visible !== false,
        paused: Boolean(parsed.paused),
        edge: clampEdge(parsed.edge),
        direction: clampDirection(parsed.direction),
        x: parsed.x as number,
        y: parsed.y as number,
        flipX: typeof parsed.flipX === "boolean" ? parsed.flipX : undefined,
        state: clampBehaviorState(parsed.state)
      };
    } catch {
      return null;
    }
  }

  private savePrefs(): void {
    try {
      const visualTransform = getVisualTransform(this.edge, this.direction);
      const payload: PersistedPetState = {
        visible: this.visible,
        paused: this.paused,
        edge: this.edge,
        direction: this.direction,
        x: Math.round(this.position.x),
        y: Math.round(this.position.y),
        flipX: visualTransform.flipX,
        state: this.behaviorState
      };
      writeFileSync(this.prefsPath, JSON.stringify(payload, null, 2), "utf8");
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
