import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { app, dialog } from "electron";
import { patchAppState } from "./app-state";
import { AudioAssetRepository } from "./db/repos/audio-asset-repository";
import { VideoAssetRepository } from "./db/repos/video-asset-repository";
import type { AudioAssetEntity, VideoAssetEntity } from "./db/entities";
import type {
  AudioAssetSummary,
  MediaImportJobSummary,
  PreparedAudioPreview,
  SaveRecordedVoiceOverInput,
  VideoAssetSummary
} from "../shared/contracts";
import { logInfo } from "./logger";
import { probeMediaDurationMs, runFfmpeg } from "./media-utils";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export class MediaService {
  private readonly audioAssetRepository: AudioAssetRepository;
  private readonly videoAssetRepository: VideoAssetRepository;
  private activeImportJob: MediaImportJobSummary | null = null;
  private clearCompletedImportJobTimer: NodeJS.Timeout | null = null;
  private readonly pendingAudioPreviewRenders = new Map<string, Promise<string>>();

  public constructor(db: Database.Database) {
    this.audioAssetRepository = new AudioAssetRepository(db);
    this.videoAssetRepository = new VideoAssetRepository(db);
  }

  public async saveRecording(input: SaveRecordedVoiceOverInput): Promise<AudioAssetSummary> {
    const recordedAt = nowIso();
    const extension = input.mimeType.includes("webm") ? ".webm" : ".wav";
    const targetDir = join(app.getPath("userData"), "assets", "audio", input.sessionId);
    const filePath = join(targetDir, `recorded-${recordedAt.replace(/[:.]/g, "-")}${extension}`);

    ensureDir(targetDir);
    writeFileSync(filePath, Buffer.from(input.buffer));

    const durationMs = await probeMediaDurationMs(filePath);
    const asset: AudioAssetEntity = {
      id: randomUUID(),
      sessionId: input.sessionId,
      type: "voice_over",
      filePath,
      durationMs,
      trimStartMs: 0,
      trimEndMs: 0,
      createdAt: recordedAt
    };

    this.audioAssetRepository.create(asset);
    logInfo("Saved recorded voice-over.", { sessionId: input.sessionId, audioAssetId: asset.id });
    return asset;
  }

  public getLatestVoiceOver(sessionId: string): AudioAssetSummary | null {
    return this.audioAssetRepository.findLatestVoiceOverBySessionId(sessionId);
  }

  public preparePreview(audioAssetId: string): Promise<string> {
    const existingTask = this.pendingAudioPreviewRenders.get(audioAssetId);
    if (existingTask) {
      return existingTask;
    }

    const task = this.preparePreviewInternal(audioAssetId).finally(() => {
      this.pendingAudioPreviewRenders.delete(audioAssetId);
    });
    this.pendingAudioPreviewRenders.set(audioAssetId, task);
    return task;
  }

  public async getPreparedPreview(audioAssetId: string): Promise<PreparedAudioPreview> {
    const previewPath = await this.preparePreview(audioAssetId);
    const buffer = readFileSync(previewPath);
    return {
      mimeType: "audio/mp4",
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  }

  public async importAppendix(sessionId: string): Promise<VideoAssetSummary | null> {
    const result = await dialog.showOpenDialog({
      title: "Import appendix clip",
      properties: ["openFile"],
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "webm", "mkv"] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const importedAt = nowIso();
    const sourcePath = result.filePaths[0];
    const targetDir = join(app.getPath("userData"), "assets", "video", sessionId);
    const extension = extname(sourcePath) || ".mp4";
    const filePath = join(targetDir, `appendix-${importedAt.replace(/[:.]/g, "-")}${extension}`);

    return this.importAppendixFromPath({
      sessionId,
      sourcePath,
      targetDir,
      filePath,
      importedAt
    });
  }

  public getLatestAppendix(sessionId: string): VideoAssetSummary | null {
    return this.videoAssetRepository.findLatestBySessionAndType(sessionId, "imported_appendix");
  }

  public getVideoAssetById(videoAssetId: string): VideoAssetSummary | null {
    return this.videoAssetRepository.findById(videoAssetId);
  }

  public createExportAsset(sessionId: string, filePath: string, durationMs: number | null): VideoAssetSummary {
    const asset: VideoAssetEntity = {
      id: randomUUID(),
      sessionId,
      type: "export",
      filePath,
      durationMs,
      createdAt: nowIso()
    };

    this.videoAssetRepository.create(asset);
    logInfo("Recorded export asset.", { sessionId, videoAssetId: asset.id, filePath });
    return asset;
  }

  public deleteSessionArtifacts(sessionId: string): void {
    const rootPaths = [
      join(app.getPath("userData"), "assets", "audio", sessionId),
      join(app.getPath("userData"), "assets", "video", sessionId),
      join(app.getPath("userData"), "assets", "screenshots", sessionId),
      join(app.getPath("userData"), "exports", "final", sessionId)
    ];

    for (const path of rootPaths) {
      rmSync(path, { recursive: true, force: true });
    }

    logInfo("Deleted session artifacts.", { sessionId });
  }

  private async preparePreviewInternal(audioAssetId: string): Promise<string> {
    const asset = this.audioAssetRepository.findById(audioAssetId);
    if (!asset || asset.type !== "voice_over") {
      throw new Error(`Voice-over asset ${audioAssetId} was not found.`);
    }

    const previewPath = join(app.getPath("userData"), "assets", "audio", asset.sessionId, `preview-${asset.id}.m4a`);

    try {
      const existingPreview = await stat(previewPath);
      if (existingPreview.size > 0) {
        return previewPath;
      }
    } catch {
      // Render a fresh preview sidecar when no cached file exists.
    }

    ensureDir(dirname(previewPath));

    try {
      await runFfmpeg([
        "-y",
        "-i",
        asset.filePath,
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        previewPath
      ]);
    } catch (error) {
      rmSync(previewPath, { force: true });
      throw error;
    }

    logInfo("Prepared voice-over preview.", { sessionId: asset.sessionId, audioAssetId: asset.id, previewPath });
    return previewPath;
  }

  private async importAppendixFromPath({
    sessionId,
    sourcePath,
    targetDir,
    filePath,
    importedAt
  }: {
    sessionId: string;
    sourcePath: string;
    targetDir: string;
    filePath: string;
    importedAt: string;
  }): Promise<VideoAssetSummary> {
    ensureDir(targetDir);
    this.startImportJob(sessionId, "appendix");

    try {
      await this.copyFileWithProgress(sourcePath, filePath);
      this.updateImportJob({ progressRatio: 0.94, message: "Analyzing media" });

      const durationMs = await probeMediaDurationMs(filePath);
      const asset: VideoAssetEntity = {
        id: randomUUID(),
        sessionId,
        type: "imported_appendix",
        filePath,
        durationMs,
        createdAt: importedAt
      };

      this.videoAssetRepository.create(asset);
      logInfo("Imported appendix video.", { sessionId, videoAssetId: asset.id });
      this.completeImportJob("Ready");
      return asset;
    } catch (error) {
      rmSync(filePath, { force: true });
      this.failImportJob(error);
      throw error;
    }
  }

  private startImportJob(sessionId: string, mediaKind: MediaImportJobSummary["mediaKind"]): void {
    if (this.activeImportJob?.status === "running") {
      throw new Error("Another media import is already in progress.");
    }

    if (this.clearCompletedImportJobTimer) {
      clearTimeout(this.clearCompletedImportJobTimer);
      this.clearCompletedImportJobTimer = null;
    }

    const job: MediaImportJobSummary = {
      id: randomUUID(),
      sessionId,
      mediaKind,
      status: "running",
      progressRatio: 0,
      message: "Copying",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      errorMessage: null
    };

    this.setImportJob(job);
  }

  private async copyFileWithProgress(sourcePath: string, targetPath: string): Promise<void> {
    const sourceStat = await stat(sourcePath);
    const totalBytes = Math.max(1, sourceStat.size);
    let copiedBytes = 0;
    let lastEmittedRatio = -1;
    let lastEmitAt = 0;

    ensureDir(dirname(targetPath));

    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(sourcePath);
      const output = createWriteStream(targetPath);

      const fail = (error: Error) => {
        input.destroy();
        output.destroy();
        reject(error);
      };

      const emitProgress = (force: boolean) => {
        const ratio = Math.min(0.92, (copiedBytes / totalBytes) * 0.92);
        const now = Date.now();
        if (!force && ratio - lastEmittedRatio < 0.015 && now - lastEmitAt < 90) {
          return;
        }

        lastEmittedRatio = ratio;
        lastEmitAt = now;
        this.updateImportJob({
          progressRatio: ratio,
          message: copiedBytes >= totalBytes ? "Analyzing media" : "Copying"
        });
      };

      input.on("data", (chunk) => {
        copiedBytes += chunk.length;
        emitProgress(false);
      });

      input.on("error", (error) => fail(error));
      output.on("error", (error) => fail(error));
      output.on("finish", () => {
        copiedBytes = totalBytes;
        emitProgress(true);
        resolve();
      });

      input.pipe(output);
    });
  }

  private setImportJob(job: MediaImportJobSummary | null): void {
    this.activeImportJob = job;
    patchAppState({ activeMediaImportJob: job });
  }

  private updateImportJob(partial: Partial<MediaImportJobSummary>): void {
    if (!this.activeImportJob) {
      return;
    }

    this.setImportJob({
      ...this.activeImportJob,
      ...partial,
      updatedAt: nowIso()
    });
  }

  private completeImportJob(message: string): void {
    if (!this.activeImportJob) {
      return;
    }

    this.setImportJob({
      ...this.activeImportJob,
      status: "completed",
      progressRatio: 1,
      message,
      updatedAt: nowIso(),
      errorMessage: null
    });

    this.clearCompletedImportJobTimer = setTimeout(() => {
      if (this.activeImportJob?.status === "completed") {
        this.setImportJob(null);
      }
      this.clearCompletedImportJobTimer = null;
    }, 1400);
  }

  private failImportJob(error: unknown): void {
    if (!this.activeImportJob) {
      return;
    }

    this.setImportJob({
      ...this.activeImportJob,
      status: "failed",
      progressRatio: this.activeImportJob.progressRatio,
      message: "Import failed",
      updatedAt: nowIso(),
      errorMessage: error instanceof Error ? error.message : "Unexpected media import error"
    });
  }
}
