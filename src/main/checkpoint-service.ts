import type Database from "better-sqlite3";
import { Notification } from "electron";
import { nativeImage } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { patchAppState } from "./app-state";
import { CaptureService } from "./capture-service";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { ScreenshotAssetRepository } from "./db/repos/screenshot-asset-repository";
import type { CheckpointEntity, ScreenshotAssetEntity } from "./db/entities";
import { RUNTIME_STATE_KEYS, RuntimeStateStore } from "./runtime-state-store";
import type {
  CheckpointSummary,
  PendingCheckpoint,
  SessionSummary,
  TimelineCheckpointSummary
} from "../shared/contracts";
import { logInfo } from "./logger";
import { hideDashboardWindow, showDashboardWindow } from "./window-manager";

function nowIso(): string {
  return new Date().toISOString();
}

function toDataUrl(pngBuffer: Buffer): string {
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export class CheckpointService {
  private readonly checkpointRepository: CheckpointRepository;
  private readonly screenshotAssetRepository: ScreenshotAssetRepository;
  private readonly captureService: CaptureService;
  private readonly runtimeStateStore: RuntimeStateStore;
  private pendingCheckpoint: PendingCheckpoint | null = null;

  public constructor(private readonly db: Database.Database) {
    this.checkpointRepository = new CheckpointRepository(db);
    this.screenshotAssetRepository = new ScreenshotAssetRepository(db);
    this.captureService = new CaptureService();
    this.runtimeStateStore = new RuntimeStateStore(db);
  }

  public initialize(): void {
    const persisted =
      this.runtimeStateStore.getJson<{ checkpointId: string; modalOpenedAt: string }>(
        RUNTIME_STATE_KEYS.pendingCheckpoint
      ) ?? null;
    const checkpoint =
      (persisted ? this.checkpointRepository.findById(persisted.checkpointId) : null) ??
      this.checkpointRepository.findLatestShell();

    if (!checkpoint || checkpoint.status !== "shell") {
      this.pendingCheckpoint = null;
      this.runtimeStateStore.setJson(RUNTIME_STATE_KEYS.pendingCheckpoint, null);
      patchAppState({ pendingCheckpoint: null });
      return;
    }

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpoint.id);
    if (!screenshotAsset) {
      this.pendingCheckpoint = null;
      this.runtimeStateStore.setJson(RUNTIME_STATE_KEYS.pendingCheckpoint, null);
      patchAppState({ pendingCheckpoint: null });
      return;
    }

    this.pendingCheckpoint = this.buildPendingCheckpoint(
      checkpoint,
      screenshotAsset,
      persisted?.modalOpenedAt ?? nowIso()
    );
    patchAppState({ pendingCheckpoint: this.pendingCheckpoint });
    this.persistPendingCheckpoint(this.pendingCheckpoint);
  }

  public getPendingCheckpoint(): PendingCheckpoint | null {
    return this.pendingCheckpoint;
  }

  public hasPendingCheckpointForSession(sessionId: string): boolean {
    return Boolean(this.pendingCheckpoint?.checkpoint.sessionId === sessionId);
  }

  public async createReminderCheckpoint(
    session: SessionSummary,
    workedOffsetSeconds: number,
    options?: {
      captureDelayMs?: number;
      hideDashboardBeforeCapture?: boolean;
    }
  ): Promise<PendingCheckpoint> {
    return this.createCheckpoint(session, workedOffsetSeconds, {
      reminderTriggered: true,
      manualCheckpoint: false,
      notificationTitle: "SessionTrail reminder",
      notificationBody: `Checkpoint captured for ${session.title}. Add a short note.`,
      captureDelayMs: options?.captureDelayMs ?? 0,
      hideDashboardBeforeCapture: options?.hideDashboardBeforeCapture ?? false
    });
  }

  public async createManualCheckpoint(
    session: SessionSummary,
    workedOffsetSeconds: number,
    options?: {
      captureDelayMs?: number;
      hideDashboardBeforeCapture?: boolean;
    }
  ): Promise<PendingCheckpoint> {
    return this.createCheckpoint(session, workedOffsetSeconds, {
      reminderTriggered: false,
      manualCheckpoint: true,
      notificationTitle: "SessionTrail manual checkpoint",
      notificationBody: `Manual checkpoint captured for ${session.title}. Add a short note.`,
      captureDelayMs: options?.captureDelayMs ?? 0,
      hideDashboardBeforeCapture: options?.hideDashboardBeforeCapture ?? false
    });
  }

  public listForSession(sessionId: string): TimelineCheckpointSummary[] {
    return this.checkpointRepository.listBySessionId(sessionId).map((checkpoint) => {
      const screenshot = this.screenshotAssetRepository.findByCheckpointId(checkpoint.id);
      return {
        ...checkpoint,
        screenshot,
        thumbnailDataUrl: screenshot ? this.readScreenshotAsThumbnailDataUrl(screenshot.filePath) : null
      };
    });
  }

  public getScreenshotPreview(checkpointId: string): string | null {
    const screenshot = this.screenshotAssetRepository.findByCheckpointId(checkpointId);
    return screenshot ? this.readScreenshotAsDataUrl(screenshot.filePath) : null;
  }

  public updateCheckpointNote(checkpointId: string, noteText: string): CheckpointSummary {
    const checkpoint = this.checkpointRepository.findById(checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint was not found.");
    }

    const normalizedNoteText = noteText.trim();
    if (!normalizedNoteText) {
      throw new Error("Checkpoint note text is required.");
    }

    checkpoint.noteText = normalizedNoteText;
    checkpoint.status = "completed";
    checkpoint.updatedAt = nowIso();
    this.checkpointRepository.update(checkpoint);

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpoint.id);
    return {
      ...checkpoint,
      screenshot: screenshotAsset
    };
  }

  private async createCheckpoint(
    session: SessionSummary,
    workedOffsetSeconds: number,
    options: {
      reminderTriggered: boolean;
      manualCheckpoint: boolean;
      notificationTitle: string;
      notificationBody: string;
      captureDelayMs: number;
      hideDashboardBeforeCapture: boolean;
    }
  ): Promise<PendingCheckpoint> {
    if (this.hasPendingCheckpointForSession(session.id)) {
      throw new Error("A checkpoint note is already pending for this session.");
    }

    const occurredAt = nowIso();
    const checkpointId = randomUUID();
    if (options.hideDashboardBeforeCapture) {
      hideDashboardWindow();
    }
    await wait(options.captureDelayMs);
    const screenshot = await this.captureService.capturePrimaryDisplayPng(session.id, checkpointId);

    const checkpoint: CheckpointEntity = {
      id: checkpointId,
      sessionId: session.id,
      occurredAt,
      workedOffsetSeconds,
      status: "shell",
      noteText: null,
      reminderTriggered: options.reminderTriggered,
      manualCheckpoint: options.manualCheckpoint,
      createdAt: occurredAt,
      updatedAt: occurredAt
    };

    const screenshotAsset: ScreenshotAssetEntity = {
      id: randomUUID(),
      checkpointId,
      filePath: screenshot.filePath,
      width: screenshot.width,
      height: screenshot.height,
      captureMode: "full_desktop",
      createdAt: occurredAt
    };

    this.db.transaction(() => {
      this.checkpointRepository.create(checkpoint);
      this.screenshotAssetRepository.create(screenshotAsset);
    })();

    const pendingCheckpoint = this.buildPendingCheckpoint(checkpoint, screenshotAsset, nowIso(), screenshot.pngBuffer);

    this.pendingCheckpoint = pendingCheckpoint;
    patchAppState({ pendingCheckpoint });
    this.persistPendingCheckpoint(pendingCheckpoint);
    logInfo("Created checkpoint shell.", {
      checkpointId,
      sessionId: session.id,
      manualCheckpoint: options.manualCheckpoint,
      reminderTriggered: options.reminderTriggered
    });

    showDashboardWindow();
    this.showNotification(options.notificationTitle, options.notificationBody);

    return pendingCheckpoint;
  }

  public finalizeCheckpoint(checkpointId: string, noteText: string): CheckpointSummary {
    const summary = this.updateCheckpointNote(checkpointId, noteText);

    if (this.pendingCheckpoint?.checkpoint.id === checkpointId) {
      this.pendingCheckpoint = null;
      patchAppState({ pendingCheckpoint: null });
      this.persistPendingCheckpoint(null);
    }

    logInfo("Finalized checkpoint.", { checkpointId });

    return summary;
  }

  private showNotification(title: string, body: string): void {
    if (!Notification.isSupported()) {
      return;
    }

    const notification = new Notification({
      title,
      body
    });

    notification.on("click", () => {
      showDashboardWindow();
    });
    notification.show();
  }

  private readScreenshotAsDataUrl(filePath: string): string {
    return toDataUrl(readFileSync(filePath));
  }

  private readScreenshotAsThumbnailDataUrl(filePath: string): string {
    const image = nativeImage.createFromBuffer(readFileSync(filePath));
    if (image.isEmpty()) {
      return this.readScreenshotAsDataUrl(filePath);
    }

    const resized = image.resize({
      width: 180,
      height: 110,
      quality: "good"
    });

    return toDataUrl(resized.toPNG());
  }

  private buildPendingCheckpoint(
    checkpoint: CheckpointEntity,
    screenshotAsset: ScreenshotAssetEntity,
    modalOpenedAt: string,
    pngBuffer?: Buffer
  ): PendingCheckpoint {
    return {
      checkpoint: {
        ...checkpoint,
        screenshot: screenshotAsset
      },
      screenshotDataUrl: pngBuffer ? toDataUrl(pngBuffer) : this.readScreenshotAsDataUrl(screenshotAsset.filePath),
      modalOpenedAt
    };
  }

  private persistPendingCheckpoint(pendingCheckpoint: PendingCheckpoint | null): void {
    this.runtimeStateStore.setJson(
      RUNTIME_STATE_KEYS.pendingCheckpoint,
      pendingCheckpoint
        ? {
            checkpointId: pendingCheckpoint.checkpoint.id,
            modalOpenedAt: pendingCheckpoint.modalOpenedAt
          }
        : null
    );
  }
}
