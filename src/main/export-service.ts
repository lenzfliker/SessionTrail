import type Database from "better-sqlite3";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { app, dialog, shell } from "electron";
import { patchAppState } from "./app-state";
import { resolveAppAssetPath } from "./asset-paths";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { ImportedMediaAssetRepository } from "./db/repos/imported-media-asset-repository";
import { ScreenshotAssetRepository } from "./db/repos/screenshot-asset-repository";
import { AudioAssetRepository } from "./db/repos/audio-asset-repository";
import { SessionRepository } from "./db/repos/session-repository";
import { ExportCompositionService } from "./export-composition-service";
import { MediaService } from "./media-service";
import { probeMediaDurationMs, runFfmpegWithHandle } from "./media-utils";
import { logError, logInfo } from "./logger";
import { RUNTIME_STATE_KEYS, RuntimeStateStore } from "./runtime-state-store";
import type { SettingsService } from "./settings-service";
import type { ExportJobSummary, ExportRunInput, ExportTimelineSegmentSummary } from "../shared/contracts";

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const SLIDE_FPS = 30;
const TITLE_CARD_DURATION_SECONDS = 2;
const AUDIO_SAMPLE_RATE_HZ = 48_000;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = "192k";
const WINDOWS_FONT_PATH = "C\\:/Windows/Fonts/segoeui.ttf";
const JOB_ROOT = ["exports", "jobs"];

function nowIso(): string {
  return new Date().toISOString();
}

function escapeForConcatFile(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

function formatOffset(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}\\:${minutes}\\:${seconds}`;
}

function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ")
    .trim();
}

function getUserDataPath(...parts: string[]): string {
  return join(app.getPath("userData"), ...parts);
}

export class ExportService {
  private readonly checkpointRepository: CheckpointRepository;
  private readonly screenshotAssetRepository: ScreenshotAssetRepository;
  private readonly audioAssetRepository: AudioAssetRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly importedMediaAssetRepository: ImportedMediaAssetRepository;
  private readonly exportCompositionService: ExportCompositionService;
  private readonly mediaService: MediaService;
  private readonly runtimeStateStore: RuntimeStateStore;
  private activeJob: ExportJobSummary | null = null;
  private activeFfmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private cancelRequested = false;

  public constructor(db: Database.Database, settingsService: SettingsService) {
    this.sessionRepository = new SessionRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
    this.screenshotAssetRepository = new ScreenshotAssetRepository(db);
    this.audioAssetRepository = new AudioAssetRepository(db);
    this.importedMediaAssetRepository = new ImportedMediaAssetRepository(db);
    this.exportCompositionService = new ExportCompositionService(db, settingsService);
    this.mediaService = new MediaService(db);
    this.runtimeStateStore = new RuntimeStateStore(db);
  }

  public initialize(): void {
    const persisted = this.runtimeStateStore.getJson<ExportJobSummary>(RUNTIME_STATE_KEYS.activeExportJob);
    if (!persisted) {
      this.setActiveJob(null);
      return;
    }

    if (persisted.status === "running") {
      this.setActiveJob({
        ...persisted,
        status: "failed",
        progressRatio: 1,
        message: "Export interrupted by app restart",
        outputFilePath: null,
        updatedAt: nowIso(),
        errorMessage: "The previous export was interrupted before completion."
      });
      return;
    }

    this.setActiveJob(persisted);
  }

  public getActiveJob(): ExportJobSummary | null {
    return this.activeJob;
  }

  public getComposition(sessionId: string) {
    return this.exportCompositionService.getComposition(sessionId);
  }

  public saveComposition(input: import("../shared/contracts").SaveExportCompositionInput) {
    return this.exportCompositionService.saveComposition(input);
  }

  public async chooseOutputPath(sessionId: string) {
    const composition = this.exportCompositionService.getComposition(sessionId);
    const result = await dialog.showSaveDialog({
      title: "Choose export location",
      defaultPath: composition.outputFilePath ?? join(app.getPath("downloads"), `SessionTrail-${nowIso().replace(/[:.]/g, "-")}.mp4`),
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
    });

    if (result.canceled || !result.filePath) {
      return composition;
    }

    const outputFilePath = extname(result.filePath).toLowerCase() === ".mp4"
      ? result.filePath
      : `${result.filePath}.mp4`;

    return this.exportCompositionService.saveComposition({
      sessionId: composition.sessionId,
      voiceOverAssetId: composition.voiceOverAssetId,
      appendixVideoAssetId: composition.appendixVideoAssetId,
      outputFilePath,
      durationMs: composition.durationMs,
      segments: composition.segments.map((segment) => ({
        id: segment.id,
        sourceKind: segment.sourceKind,
        sourceId: segment.sourceId,
        startOffsetMs: segment.startOffsetMs,
        endOffsetMs: segment.endOffsetMs,
        mediaStartOffsetMs: segment.mediaStartOffsetMs,
        sortOrder: segment.sortOrder,
        source: segment.source
      }))
    });
  }

  public cancel(): ExportJobSummary | null {
    if (!this.activeJob || this.activeJob.status !== "running") {
      return this.activeJob;
    }

    this.cancelRequested = true;
    this.activeFfmpegProcess?.kill("SIGKILL");
    this.updateJob({ message: "Canceling export" });
    return this.activeJob;
  }

  public revealOutput(sessionId: string): boolean {
    const outputPath = this.resolveOutputPath(sessionId);
    if (!outputPath) {
      return false;
    }

    shell.showItemInFolder(outputPath);
    return true;
  }

  public async openOutput(sessionId: string): Promise<boolean> {
    const outputPath = this.resolveOutputPath(sessionId);
    if (!outputPath) {
      return false;
    }

    return (await shell.openPath(outputPath)) === "";
  }

  public run(input: ExportRunInput): ExportJobSummary {
    if (this.activeJob?.status === "running") {
      throw new Error("An export is already in progress.");
    }

    const job: ExportJobSummary = {
      id: randomUUID(),
      sessionId: input.sessionId,
      status: "running",
      progressRatio: 0,
      message: "Preparing export",
      outputFilePath: null,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      errorMessage: null
    };

    this.cancelRequested = false;
    this.setActiveJob(job);
    logInfo("Started export job.", { jobId: job.id, sessionId: job.sessionId });
    void this.execute(job, input);

    return job;
  }

  private async execute(job: ExportJobSummary, input: ExportRunInput): Promise<void> {
    const jobDir = getUserDataPath(...JOB_ROOT, job.id);
    mkdirSync(jobDir, { recursive: true });

    try {
      this.throwIfCanceled();
      const session = this.sessionRepository.findById(input.sessionId);
      if (!session) {
        throw new Error(`Session ${input.sessionId} was not found.`);
      }

      const composition = this.exportCompositionService.getComposition(input.sessionId);
      if (composition.segments.length === 0) {
        throw new Error("Export requires at least one timed checkpoint segment.");
      }

      const resolvedVoiceOverAssetId = input.voiceOverAssetId ?? composition.voiceOverAssetId;
      const voiceOver = resolvedVoiceOverAssetId
        ? this.audioAssetRepository.findById(resolvedVoiceOverAssetId)
        : null;

      this.updateJob({
        progressRatio: 0.05,
        message: "Rendering timeline clips"
      });

      const slideClipPaths: string[] = [];
      for (let index = 0; index < composition.segments.length; index += 1) {
        this.throwIfCanceled();
        const segment = composition.segments[index];
        const slidePath = join(jobDir, `slide-${index + 1}.mp4`);
        await this.renderSegmentClip(segment, slidePath);
        slideClipPaths.push(slidePath);
        this.updateJob({
          progressRatio: 0.1 + ((index + 1) / composition.segments.length) * 0.35,
          message: `Rendered timeline segment ${index + 1} of ${composition.segments.length}`
        });
      }

      const slidesListPath = join(jobDir, "slides.txt");
      writeFileSync(
        slidesListPath,
        slideClipPaths.map((filePath) => `file '${escapeForConcatFile(filePath)}'`).join("\n"),
        "utf8"
      );

      const slideshowPath = join(jobDir, "slideshow.mp4");
      this.updateJob({
        progressRatio: 0.5,
        message: voiceOver ? "Attaching voice-over" : "Creating timeline video"
      });
      this.throwIfCanceled();
      await this.renderSlideshow(
        slidesListPath,
        slideshowPath,
        composition.durationMs / 1000,
        voiceOver
      );

      const introCardPath = join(jobDir, "intro-card.mp4");
      const outroCardPath = join(jobDir, "outro-card.mp4");
      this.updateJob({
        progressRatio: 0.62,
        message: "Rendering title cards"
      });
      this.throwIfCanceled();
      await this.renderIntroCard(session.title, introCardPath);
      this.throwIfCanceled();
      await this.renderOutroCard(outroCardPath);

      const finalSourcePaths = [introCardPath, slideshowPath, outroCardPath];

      const concatListPath = join(jobDir, "concat.txt");
      writeFileSync(
        concatListPath,
        finalSourcePaths.map((filePath) => `file '${escapeForConcatFile(filePath)}'`).join("\n"),
        "utf8"
      );

      const outputPath = composition.outputFilePath ?? join(
        app.getPath("downloads"),
        `SessionTrail-${job.startedAt.replace(/[:.]/g, "-")}.mp4`
      );
      mkdirSync(dirname(outputPath), { recursive: true });

      this.updateJob({
        progressRatio: 0.85,
        message: "Finalizing MP4"
      });
      this.throwIfCanceled();
      await this.runFfmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-b:a",
        AUDIO_BITRATE,
        "-ar",
        String(AUDIO_SAMPLE_RATE_HZ),
        "-ac",
        String(AUDIO_CHANNELS),
        "-pix_fmt",
        "yuv420p",
        outputPath
      ]);

      this.throwIfCanceled();
      const durationMs = await probeMediaDurationMs(outputPath);
      this.mediaService.createExportAsset(input.sessionId, outputPath, durationMs);

      this.setActiveJob({
        ...job,
        status: "completed",
        progressRatio: 1,
        message: "Export complete",
        outputFilePath: outputPath,
        updatedAt: nowIso(),
        errorMessage: null
      });
      logInfo("Completed export job.", { jobId: job.id, outputPath });
    } catch (error) {
      const canceled = this.cancelRequested;
      this.setActiveJob({
        ...job,
        status: "failed",
        progressRatio: 1,
        message: canceled ? "Export canceled" : "Export failed",
        outputFilePath: null,
        updatedAt: nowIso(),
        errorMessage: canceled
          ? "Canceled by user"
          : error instanceof Error
            ? error.message
            : "Unexpected export error"
      });
      logError("Export job failed.", error);
    } finally {
      this.cancelRequested = false;
      this.activeFfmpegProcess = null;
      rmSync(jobDir, { recursive: true, force: true });
    }
  }

  private async renderSegmentClip(
    segment: ExportTimelineSegmentSummary,
    outputPath: string
  ): Promise<void> {
    const durationSeconds = Math.max(0.5, (segment.endOffsetMs - segment.startOffsetMs) / 1000);
    if (segment.sourceKind === "checkpoint") {
      await this.renderCheckpointSegmentClip(segment.sourceId, outputPath, durationSeconds);
      return;
    }

    if (segment.sourceKind === "imported_image") {
      await this.renderImportedImageClip(segment.sourceId, outputPath, durationSeconds);
      return;
    }

    await this.renderImportedVideoClip(segment, outputPath, durationSeconds);
  }

  private async renderCheckpointSegmentClip(
    checkpointId: string,
    outputPath: string,
    durationSeconds: number
  ): Promise<void> {
    const checkpoint = this.checkpointRepository.findById(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} was not found.`);
    }

    const screenshotAsset = this.screenshotAssetRepository.findByCheckpointId(checkpoint.id);
    if (!screenshotAsset) {
      throw new Error(`Checkpoint ${checkpoint.id} is missing a screenshot asset.`);
    }

      const noteText = checkpoint.noteText?.trim() || "No note";
      const overlayText = `${formatOffset(checkpoint.workedOffsetSeconds)}  ${escapeDrawText(noteText)}`;
      const filter = [
      `scale=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white`,
      "drawbox=0:0:iw:ih:color=black:t=4",
      `drawtext=fontfile='${WINDOWS_FONT_PATH}':text='${overlayText}':fontcolor=black:bordercolor=white:borderw=3:fontsize=28:x=48:y=608`
    ].join(",");

    await this.runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-t",
      durationSeconds.toFixed(2),
      "-i",
      screenshotAsset.filePath,
      "-vf",
      filter,
      "-r",
      String(SLIDE_FPS),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ]);
  }

  private async renderImportedImageClip(
    assetId: string,
    outputPath: string,
    durationSeconds: number
  ): Promise<void> {
    const asset = this.importedMediaAssetRepository.findById(assetId);
    if (!asset || asset.kind !== "image") {
      throw new Error(`Imported image ${assetId} was not found.`);
    }

    await this.runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-t",
      durationSeconds.toFixed(2),
      "-i",
      asset.filePath,
      "-vf",
      `scale=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white`,
      "-r",
      String(SLIDE_FPS),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ]);
  }

  private async renderImportedVideoClip(
    segment: ExportTimelineSegmentSummary,
    outputPath: string,
    durationSeconds: number
  ): Promise<void> {
    const asset = this.importedMediaAssetRepository.findById(segment.sourceId);
    if (!asset || asset.kind !== "video") {
      throw new Error(`Imported video ${segment.sourceId} was not found.`);
    }

    const clipStartSeconds = Math.max(0, segment.mediaStartOffsetMs / 1000);
    const remainingSeconds = Math.max(0, ((asset.durationMs ?? 0) - segment.mediaStartOffsetMs) / 1000);
    const freezeSeconds = Math.max(0, durationSeconds - remainingSeconds);
    const scalePad = `scale=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white`;
    const filter = freezeSeconds > 0.02
      ? `${scalePad},tpad=stop_mode=clone:stop_duration=${freezeSeconds.toFixed(2)}`
      : scalePad;

    await this.runFfmpeg([
      "-y",
      "-ss",
      clipStartSeconds.toFixed(2),
      "-i",
      asset.filePath,
      "-vf",
      filter,
      "-an",
      "-t",
      durationSeconds.toFixed(2),
      "-r",
      String(SLIDE_FPS),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ]);
  }

  private async renderSlideshow(
    slidesListPath: string,
    outputPath: string,
    totalDurationSeconds: number,
    voiceOver: {
      filePath: string;
      durationMs: number | null;
    } | null
  ): Promise<void> {
    if (voiceOver) {
      const effectiveDurationSeconds = Math.max(
        0.1,
        totalDurationSeconds || (voiceOver.durationMs ?? 0) / 1000
      );
      await this.runFfmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        slidesListPath,
        "-i",
        voiceOver.filePath,
        "-filter_complex",
        `[1:a]aresample=async=1:first_pts=0,apad=pad_dur=${Math.max(0, effectiveDurationSeconds).toFixed(2)}[aout]`,
        "-t",
        effectiveDurationSeconds.toFixed(2),
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-b:a",
        AUDIO_BITRATE,
        "-ar",
        String(AUDIO_SAMPLE_RATE_HZ),
        "-ac",
        String(AUDIO_CHANNELS),
        "-pix_fmt",
        "yuv420p",
        outputPath
      ]);
      return;
    }

    await this.runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      slidesListPath,
      "-f",
      "lavfi",
      "-t",
      totalDurationSeconds.toFixed(2),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      AUDIO_BITRATE,
      "-ar",
      String(AUDIO_SAMPLE_RATE_HZ),
      "-ac",
      String(AUDIO_CHANNELS),
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      outputPath
    ]);
  }

  private async renderIntroCard(sessionTitle: string, outputPath: string): Promise<void> {
    await this.runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=${SLIDE_WIDTH}x${SLIDE_HEIGHT}:r=${SLIDE_FPS}`,
      "-f",
      "lavfi",
      "-t",
      String(TITLE_CARD_DURATION_SECONDS),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-vf",
      `drawtext=fontfile='${WINDOWS_FONT_PATH}':text='${escapeDrawText(sessionTitle)}':fontcolor=black:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-t",
      String(TITLE_CARD_DURATION_SECONDS),
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      AUDIO_BITRATE,
      "-ar",
      String(AUDIO_SAMPLE_RATE_HZ),
      "-ac",
      String(AUDIO_CHANNELS),
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      outputPath
    ]);
  }

  private async renderOutroCard(outputPath: string): Promise<void> {
    await this.runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=${SLIDE_WIDTH}x${SLIDE_HEIGHT}:r=${SLIDE_FPS}`,
      "-loop",
      "1",
      "-i",
      resolveAppAssetPath("sessiontrail-app-icon.png"),
      "-f",
      "lavfi",
      "-t",
      String(TITLE_CARD_DURATION_SECONDS),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      `[1:v]scale=220:-1[icon];[0:v][icon]overlay=(W-w)/2:170[card];[card]drawtext=fontfile='${WINDOWS_FONT_PATH}':text='SessionTrail':fontcolor=black:fontsize=54:x=(w-text_w)/2:y=460[vout]`,
      "-t",
      String(TITLE_CARD_DURATION_SECONDS),
      "-map",
      "[vout]",
      "-map",
      "2:a",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      AUDIO_BITRATE,
      "-ar",
      String(AUDIO_SAMPLE_RATE_HZ),
      "-ac",
      String(AUDIO_CHANNELS),
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      outputPath
    ]);
  }

  private setActiveJob(job: ExportJobSummary | null): void {
    this.activeJob = job;
    this.runtimeStateStore.setJson(RUNTIME_STATE_KEYS.activeExportJob, job);
    patchAppState({ activeExportJob: job });
  }

  private updateJob(partial: Partial<ExportJobSummary>): void {
    if (!this.activeJob) {
      return;
    }

    this.setActiveJob({
      ...this.activeJob,
      ...partial,
      updatedAt: nowIso()
    });
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    this.throwIfCanceled();
    const running = runFfmpegWithHandle(args);
    this.activeFfmpegProcess = running.process;

    try {
      await running.completion;
    } finally {
      if (this.activeFfmpegProcess === running.process) {
        this.activeFfmpegProcess = null;
      }
    }
  }

  private throwIfCanceled(): void {
    if (this.cancelRequested) {
      throw new Error("Canceled by user");
    }
  }

  private resolveOutputPath(sessionId: string): string | null {
    if (this.activeJob?.sessionId === sessionId && this.activeJob.outputFilePath) {
      return this.activeJob.outputFilePath;
    }

    const composition = this.exportCompositionService.getComposition(sessionId);
    return composition.outputFilePath;
  }
}
