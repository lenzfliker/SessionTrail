import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { join } from "node:path";
import { AudioAssetRepository } from "./db/repos/audio-asset-repository";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { ExportCompositionRepository } from "./db/repos/export-composition-repository";
import { ExportTimelineSegmentRepository } from "./db/repos/export-timeline-segment-repository";
import type { SettingsService } from "./settings-service";
import { VideoAssetRepository } from "./db/repos/video-asset-repository";
import type { ExportCompositionEntity, ExportTimelineSegmentEntity } from "./db/entities";
import type {
  ExportCompositionSummary,
  ExportTimelineSegmentSummary,
  SaveExportCompositionInput
} from "../shared/contracts";

const DEFAULT_SEGMENT_DURATION_MS = 4_000;
const MIN_SEGMENT_DURATION_MS = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function sortAndNormalizeSegments(
  sessionId: string,
  segments: SaveExportCompositionInput["segments"],
  durationMs: number
): ExportTimelineSegmentEntity[] {
  const normalizedSegments: ExportTimelineSegmentEntity[] = [];
  const sortedSegments = [...segments].sort(
    (left, right) => left.startOffsetMs - right.startOffsetMs || left.sortOrder - right.sortOrder
  );

  for (let index = 0; index < sortedSegments.length; index += 1) {
    const segment = sortedSegments[index];
    const previousSegment = normalizedSegments[index - 1] ?? null;
    const createdAt = nowIso();
    const startOffsetMs =
      index === 0 ? 0 : Math.max(previousSegment?.endOffsetMs ?? 0, segment.startOffsetMs);
    const endOffsetMs = Math.max(segment.endOffsetMs, startOffsetMs + MIN_SEGMENT_DURATION_MS);

    normalizedSegments.push({
      id: segment.id ?? randomUUID(),
      sessionId,
      checkpointId: segment.checkpointId,
      startOffsetMs,
      endOffsetMs,
      sortOrder: index,
      source: segment.source,
      createdAt,
      updatedAt: createdAt
    });
  }

  for (let index = 0; index < normalizedSegments.length; index += 1) {
    if (index > 0) {
      normalizedSegments[index].startOffsetMs = normalizedSegments[index - 1].endOffsetMs;
    }

    normalizedSegments[index].endOffsetMs = Math.max(
      normalizedSegments[index].endOffsetMs,
      normalizedSegments[index].startOffsetMs + MIN_SEGMENT_DURATION_MS
    );
  }

  if (normalizedSegments.length > 0) {
    normalizedSegments[normalizedSegments.length - 1].endOffsetMs = Math.max(
      durationMs,
      normalizedSegments[normalizedSegments.length - 1].startOffsetMs + MIN_SEGMENT_DURATION_MS
    );
  }

  return normalizedSegments;
}

function toSummary(
  composition: ExportCompositionEntity,
  segments: ExportTimelineSegmentEntity[]
): ExportCompositionSummary {
  return {
    sessionId: composition.sessionId,
    voiceOverAssetId: composition.voiceOverAssetId,
    appendixVideoAssetId: composition.appendixVideoAssetId,
    outputFilePath: composition.outputFilePath,
    durationMs: composition.durationMs,
    segments: segments.map((segment): ExportTimelineSegmentSummary => ({
      id: segment.id,
      sessionId: segment.sessionId,
      checkpointId: segment.checkpointId,
      startOffsetMs: segment.startOffsetMs,
      endOffsetMs: segment.endOffsetMs,
      sortOrder: segment.sortOrder,
      source: segment.source,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt
    })),
    updatedAt: composition.updatedAt,
    createdAt: composition.createdAt
  };
}

export class ExportCompositionService {
  private readonly exportCompositionRepository: ExportCompositionRepository;
  private readonly exportTimelineSegmentRepository: ExportTimelineSegmentRepository;
  private readonly checkpointRepository: CheckpointRepository;
  private readonly audioAssetRepository: AudioAssetRepository;
  private readonly videoAssetRepository: VideoAssetRepository;

  public constructor(
    private readonly db: Database.Database,
    private readonly settingsService: SettingsService
  ) {
    this.exportCompositionRepository = new ExportCompositionRepository(db);
    this.exportTimelineSegmentRepository = new ExportTimelineSegmentRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
    this.audioAssetRepository = new AudioAssetRepository(db);
    this.videoAssetRepository = new VideoAssetRepository(db);
  }

  public getComposition(sessionId: string): ExportCompositionSummary {
    const existingComposition = this.exportCompositionRepository.findBySessionId(sessionId);
    const existingSegments = this.exportTimelineSegmentRepository.listBySessionId(sessionId);
    if (existingComposition) {
      return toSummary(existingComposition, existingSegments);
    }

    const voiceOverAsset = this.audioAssetRepository.findLatestVoiceOverBySessionId(sessionId);
    const appendixVideoAsset = this.videoAssetRepository.findLatestBySessionAndType(sessionId, "imported_appendix");
    const checkpoints = this.checkpointRepository
      .listBySessionId(sessionId)
      .filter((checkpoint) => checkpoint.status === "completed");
    const durationMs = this.getDefaultDurationMs(voiceOverAsset?.durationMs ?? null, checkpoints.length);
    const createdAt = nowIso();
    const composition: ExportCompositionEntity = {
      sessionId,
      voiceOverAssetId: voiceOverAsset?.id ?? null,
      appendixVideoAssetId: appendixVideoAsset?.id ?? null,
      outputFilePath: this.getDefaultOutputPath(),
      durationMs,
      createdAt,
      updatedAt: createdAt
    };
    const segments = this.seedSegments(sessionId, checkpoints.map((checkpoint) => checkpoint.id), durationMs);

    this.db.transaction(() => {
      this.exportCompositionRepository.upsert(composition);
      this.exportTimelineSegmentRepository.replaceForSession(sessionId, segments);
    })();

    return toSummary(composition, segments);
  }

  public saveComposition(input: SaveExportCompositionInput): ExportCompositionSummary {
    const current = this.exportCompositionRepository.findBySessionId(input.sessionId);
    const createdAt = current?.createdAt ?? nowIso();
    const resolvedVoiceOverAssetId =
      input.voiceOverAssetId !== undefined
        ? input.voiceOverAssetId
        : current
          ? current.voiceOverAssetId
          : this.audioAssetRepository.findLatestVoiceOverBySessionId(input.sessionId)?.id ?? null;
    const resolvedAppendixVideoAssetId =
      input.appendixVideoAssetId !== undefined
        ? input.appendixVideoAssetId
        : current
          ? current.appendixVideoAssetId
          : this.videoAssetRepository.findLatestBySessionAndType(input.sessionId, "imported_appendix")?.id ?? null;
    const resolvedOutputFilePath =
      input.outputFilePath !== undefined
        ? input.outputFilePath
        : current?.outputFilePath ?? this.getDefaultOutputPath();
    const audioAsset = resolvedVoiceOverAssetId ? this.audioAssetRepository.findById(resolvedVoiceOverAssetId) : null;
    const effectiveVoiceDurationMs = audioAsset?.durationMs ?? 0;
    const desiredDurationMs = Math.max(
      input.durationMs ?? current?.durationMs ?? 0,
      effectiveVoiceDurationMs,
      input.segments.at(-1)?.endOffsetMs ?? 0
    );
    const durationMs = desiredDurationMs > 0 ? desiredDurationMs : this.getDefaultDurationMs(audioAsset?.durationMs ?? null, input.segments.length);
    const composition: ExportCompositionEntity = {
      sessionId: input.sessionId,
      voiceOverAssetId: resolvedVoiceOverAssetId ?? null,
      appendixVideoAssetId: resolvedAppendixVideoAssetId ?? null,
      outputFilePath: resolvedOutputFilePath ?? null,
      durationMs,
      createdAt,
      updatedAt: nowIso()
    };
    const segments = sortAndNormalizeSegments(input.sessionId, input.segments, durationMs);

    this.db.transaction(() => {
      this.exportCompositionRepository.upsert(composition);
      this.exportTimelineSegmentRepository.replaceForSession(input.sessionId, segments);
    })();

    return toSummary(composition, segments);
  }

  private getDefaultDurationMs(audioDurationMs: number | null, checkpointCount: number): number {
    if (audioDurationMs && audioDurationMs > 0) {
      return audioDurationMs;
    }

    return Math.max(DEFAULT_SEGMENT_DURATION_MS, checkpointCount * DEFAULT_SEGMENT_DURATION_MS);
  }

  private getDefaultOutputPath(): string {
    const settings = this.settingsService.getSettings();
    return join(
      settings.defaultExportDirectory || app.getPath("downloads"),
      `SessionTrail-${nowIso().replace(/[:.]/g, "-")}.mp4`
    );
  }

  private seedSegments(sessionId: string, checkpointIds: string[], durationMs: number): ExportTimelineSegmentEntity[] {
    if (checkpointIds.length === 0) {
      return [];
    }

    const segmentDurationMs = Math.max(MIN_SEGMENT_DURATION_MS, Math.floor(durationMs / checkpointIds.length));
    const createdAt = nowIso();

    return checkpointIds.map((checkpointId, index) => ({
      id: randomUUID(),
      sessionId,
      checkpointId,
      startOffsetMs: index * segmentDurationMs,
      endOffsetMs: index === checkpointIds.length - 1 ? durationMs : (index + 1) * segmentDurationMs,
      sortOrder: index,
      source: "seeded",
      createdAt,
      updatedAt: createdAt
    }));
  }
}
