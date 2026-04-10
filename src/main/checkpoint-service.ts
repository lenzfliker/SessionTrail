import type Database from "better-sqlite3";
import { Notification } from "electron";
import { nativeImage } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { patchAppState } from "./app-state";
import { CaptureService } from "./capture-service";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { ExportTimelineSegmentRepository } from "./db/repos/export-timeline-segment-repository";
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
  private readonly exportTimelineSegmentRepository: ExportTimelineSegmentRepository;
  private readonly captureService: CaptureService;
  private readonly runtimeStateStore: RuntimeStateStore;
  private pendingCheckpoint: PendingCheckpoint | null = null;

  public constructor(private readonly db: Database.Database) {
    this.checkpointRepository = new CheckpointRepository(db);
    this.screenshotAssetRepository = new ScreenshotAssetRepository(db);
    this.exportTimelineSegmentRepository = new ExportTimelineSegmentRepository(db);
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

  public async retakePendingCheckpoint(
    checkpointId: string,
    options?: {
      captureDelayMs?: number;
      hideDashboardBeforeCapture?: boolean;
    }
  ): Promise<PendingCheckpoint> {
    const checkpoint = this.checkpointRepository.findById(checkpointId);
    if (!checkpoint || checkpoint.status !== "shell" || this.pendingCheckpoint?.checkpoint.id !== checkpointId) {
      throw new Error("Only the active pending checkpoint can be retaken.");
    }

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpointId);
    if (!screenshotAsset) {
      throw new Error("Pending checkpoint screenshot was not found.");
    }

    try {
      if (options?.hideDashboardBeforeCapture) {
        hideDashboardWindow();
      }
      await wait(options?.captureDelayMs ?? 0);

      const screenshot = await this.captureService.capturePrimaryDisplayPng(checkpoint.sessionId, checkpointId);
      const updatedScreenshotAsset: ScreenshotAssetEntity = {
        ...screenshotAsset,
        filePath: screenshot.filePath,
        width: screenshot.width,
        height: screenshot.height,
        captureMode: "full_desktop"
      };

      this.screenshotAssetRepository.update(updatedScreenshotAsset);

      const pendingCheckpoint = this.buildPendingCheckpoint(
        checkpoint,
        updatedScreenshotAsset,
        this.pendingCheckpoint.modalOpenedAt,
        screenshot.pngBuffer
      );
      this.setPendingCheckpointState(pendingCheckpoint);
      return pendingCheckpoint;
    } finally {
      showDashboardWindow();
    }
  }

  public replacePendingScreenshot(checkpointId: string, buffer: ArrayBuffer): PendingCheckpoint {
    const checkpoint = this.checkpointRepository.findById(checkpointId);
    if (!checkpoint || checkpoint.status !== "shell" || this.pendingCheckpoint?.checkpoint.id !== checkpointId) {
      throw new Error("Only the active pending checkpoint can be updated.");
    }

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpointId);
    if (!screenshotAsset) {
      throw new Error("Pending checkpoint screenshot was not found.");
    }

    const pngBuffer = Buffer.from(buffer);
    const image = nativeImage.createFromBuffer(pngBuffer);
    if (image.isEmpty()) {
      throw new Error("Edited screenshot data is invalid.");
    }

    writeFileSync(screenshotAsset.filePath, pngBuffer);
    const size = image.getSize();
    const updatedScreenshotAsset: ScreenshotAssetEntity = {
      ...screenshotAsset,
      width: size.width || screenshotAsset.width,
      height: size.height || screenshotAsset.height
    };

    this.screenshotAssetRepository.update(updatedScreenshotAsset);

    const pendingCheckpoint = this.buildPendingCheckpoint(
      checkpoint,
      updatedScreenshotAsset,
      this.pendingCheckpoint.modalOpenedAt,
      pngBuffer
    );
    this.setPendingCheckpointState(pendingCheckpoint);
    return pendingCheckpoint;
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

  public deleteCheckpoint(checkpointId: string): void {
    const checkpoint = this.checkpointRepository.findById(checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint was not found.");
    }

    if (checkpoint.status !== "completed") {
      throw new Error("Only completed checkpoints can be deleted.");
    }

    if (this.pendingCheckpoint?.checkpoint.id === checkpointId) {
      throw new Error("The active pending checkpoint cannot be deleted.");
    }

    if (this.exportTimelineSegmentRepository.countByCheckpointId(checkpointId) > 0) {
      throw new Error("This checkpoint is still used in the timeline. Reassign or remove its segment before deleting it.");
    }

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpointId);
    this.db.transaction(() => {
      this.checkpointRepository.delete(checkpointId);
    })();

    if (screenshotAsset) {
      rmSync(screenshotAsset.filePath, { force: true });
    }
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

    this.setPendingCheckpointState(pendingCheckpoint);
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
      this.setPendingCheckpointState(null);
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

  private setPendingCheckpointState(pendingCheckpoint: PendingCheckpoint | null): void {
    this.pendingCheckpoint = pendingCheckpoint;
    patchAppState({ pendingCheckpoint });
    this.persistPendingCheckpoint(pendingCheckpoint);
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
