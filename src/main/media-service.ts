import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { app, dialog } from "electron";
import { patchAppState } from "./app-state";
import { AudioAssetRepository } from "./db/repos/audio-asset-repository";
import { ExportTimelineSegmentRepository } from "./db/repos/export-timeline-segment-repository";
import { ImportedMediaAssetRepository } from "./db/repos/imported-media-asset-repository";
import { VideoAssetRepository } from "./db/repos/video-asset-repository";
import type { AudioAssetEntity, ImportedMediaAssetEntity, VideoAssetEntity } from "./db/entities";
import type {
  AudioAssetSummary,
  ImportedMediaAssetSummary,
  MediaImportJobSummary,
  PreparedAudioPreview,
  SaveRecordedVoiceOverInput,
  VideoAssetSummary
} from "../shared/contracts";
import { logInfo } from "./logger";
import { probeMediaDurationMs, runFfmpeg } from "./media-utils";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function getImportedMediaKind(filePath: string): ImportedMediaAssetEntity["kind"] {
  const extension = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  throw new Error(`Unsupported media type for ${filePath}.`);
}

function toImportedMediaSummary(asset: ImportedMediaAssetEntity): ImportedMediaAssetSummary {
  return asset;
}

export class MediaService {
  private readonly audioAssetRepository: AudioAssetRepository;
  private readonly videoAssetRepository: VideoAssetRepository;
  private readonly importedMediaAssetRepository: ImportedMediaAssetRepository;
  private readonly exportTimelineSegmentRepository: ExportTimelineSegmentRepository;
  private activeImportJob: MediaImportJobSummary | null = null;
  private clearCompletedImportJobTimer: NodeJS.Timeout | null = null;
  private readonly pendingAudioPreviewRenders = new Map<string, Promise<string>>();

  public constructor(db: Database.Database) {
    this.audioAssetRepository = new AudioAssetRepository(db);
    this.videoAssetRepository = new VideoAssetRepository(db);
    this.importedMediaAssetRepository = new ImportedMediaAssetRepository(db);
    this.exportTimelineSegmentRepository = new ExportTimelineSegmentRepository(db);
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

  public async importAssets(sessionId: string): Promise<ImportedMediaAssetSummary[]> {
    const result = await dialog.showOpenDialog({
      title: "Import images or videos",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images and Video", extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map((extension) => extension.slice(1)) }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const importedAt = nowIso();
    const targetDir = join(app.getPath("userData"), "assets", "imports", sessionId);
    ensureDir(targetDir);
    this.startImportJob(sessionId, "imported_media");

    try {
      const importedAssets: ImportedMediaAssetSummary[] = [];
      const totalFiles = result.filePaths.length;

      for (let index = 0; index < totalFiles; index += 1) {
        const sourcePath = result.filePaths[index];
        const kind = getImportedMediaKind(sourcePath);
        const extension = extname(sourcePath).toLowerCase() || (kind === "image" ? ".png" : ".mp4");
        const filePath = join(targetDir, `${kind}-${importedAt.replace(/[:.]/g, "-")}-${index + 1}${extension}`);
        await this.copyFileWithProgress(sourcePath, filePath, {
          startRatio: index / totalFiles,
          endRatio: (index + 0.9) / totalFiles,
          message: `Copying ${index + 1} of ${totalFiles}`
        });

        this.updateImportJob({
          progressRatio: (index + 0.93) / totalFiles,
          message: `Analyzing ${index + 1} of ${totalFiles}`
        });

        const durationMs = kind === "video" ? await probeMediaDurationMs(filePath) : null;
        const asset: ImportedMediaAssetEntity = {
          id: randomUUID(),
          sessionId,
          kind,
          filePath,
          durationMs,
          createdAt: importedAt
        };

        this.importedMediaAssetRepository.create(asset);
        importedAssets.push(toImportedMediaSummary(asset));
      }

      logInfo("Imported session media assets.", { sessionId, importedAssetCount: importedAssets.length });
      this.completeImportJob("Ready");
      return importedAssets;
    } catch (error) {
      this.failImportJob(error);
      throw error;
    }
  }

  public listImports(sessionId: string): ImportedMediaAssetSummary[] {
    return this.importedMediaAssetRepository.listBySessionId(sessionId).map(toImportedMediaSummary);
  }

  public getImportById(assetId: string): ImportedMediaAssetSummary | null {
    const asset = this.importedMediaAssetRepository.findById(assetId);
    return asset ? toImportedMediaSummary(asset) : null;
  }

  public deleteImport(assetId: string): void {
    const asset = this.importedMediaAssetRepository.findById(assetId);
    if (!asset) {
      throw new Error("Imported media was not found.");
    }

    if (this.exportTimelineSegmentRepository.countByImportId(assetId) > 0) {
      throw new Error("This imported media is still used in the timeline.");
    }

    this.importedMediaAssetRepository.deleteById(assetId);
    unlinkSync(asset.filePath);
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
      join(app.getPath("userData"), "assets", "imports", sessionId),
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

  private async copyFileWithProgress(
    sourcePath: string,
    targetPath: string,
    options: { startRatio: number; endRatio: number; message: string }
  ): Promise<void> {
    const sourceStat = await stat(sourcePath);
    const totalBytes = Math.max(1, sourceStat.size);
    let copiedBytes = 0;
    let lastEmittedRatio = -1;
    let lastEmitAt = 0;

    ensureDir(dirname(targetPath));

    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(sourcePath);
      const output = createWriteStream(targetPath);

      const cleanup = (error?: Error) => {
        input.destroy();
        output.destroy();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      input.on("data", (chunk) => {
        copiedBytes += chunk.length;
        const baseRatio = copiedBytes / totalBytes;
        const scaledRatio = options.startRatio + (options.endRatio - options.startRatio) * baseRatio;
        const now = Date.now();
        if (scaledRatio - lastEmittedRatio >= 0.01 || now - lastEmitAt >= 150) {
          lastEmittedRatio = scaledRatio;
          lastEmitAt = now;
          this.updateImportJob({
            progressRatio: scaledRatio,
            message: options.message
          });
        }
      });

      input.once("error", (error) => cleanup(error));
      output.once("error", (error) => cleanup(error));
      output.once("close", () => cleanup());
      input.pipe(output);
    });
  }

  private completeImportJob(message: string): void {
    this.updateImportJob({
      status: "completed",
      progressRatio: 1,
      message,
      errorMessage: null
    });

    this.clearCompletedImportJobTimer = setTimeout(() => {
      this.setImportJob(null);
      this.clearCompletedImportJobTimer = null;
    }, 2_000);
  }

  private failImportJob(error: unknown): void {
    this.updateImportJob({
      status: "failed",
      progressRatio: 1,
      message: "Import failed",
      errorMessage: error instanceof Error ? error.message : "Unexpected import error"
    });
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

  private setImportJob(job: MediaImportJobSummary | null): void {
    this.activeImportJob = job;
    patchAppState({ activeMediaImportJob: job });
  }
}
