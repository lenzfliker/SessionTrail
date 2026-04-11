import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { join } from "node:path";
import { AudioAssetRepository } from "./db/repos/audio-asset-repository";
import { CheckpointRepository } from "./db/repos/checkpoint-repository";
import { ExportCompositionRepository } from "./db/repos/export-composition-repository";
import { ExportTimelineSegmentRepository } from "./db/repos/export-timeline-segment-repository";
import { ImportedMediaAssetRepository } from "./db/repos/imported-media-asset-repository";
import type { SettingsService } from "./settings-service";
import { VideoAssetRepository } from "./db/repos/video-asset-repository";
import type { ExportCompositionEntity, ExportTimelineSegmentEntity } from "./db/entities";
import type {
  ExportCompositionSummary,
  ExportTimelineSegmentSummary,
  SaveExportCompositionInput,
  VisualSourceKind
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
      sourceKind: segment.sourceKind,
      sourceId: segment.sourceId,
      startOffsetMs,
      endOffsetMs,
      mediaStartOffsetMs: Math.max(0, segment.mediaStartOffsetMs ?? 0),
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
      sourceKind: segment.sourceKind,
      sourceId: segment.sourceId,
      startOffsetMs: segment.startOffsetMs,
      endOffsetMs: segment.endOffsetMs,
      mediaStartOffsetMs: segment.mediaStartOffsetMs,
      sortOrder: segment.sortOrder,
      source: segment.source,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt
    })),
    updatedAt: composition.updatedAt,
    createdAt: composition.createdAt
  };
}

function getImportedSourceKind(kind: "image" | "video"): VisualSourceKind {
  return kind === "image" ? "imported_image" : "imported_video";
}

export class ExportCompositionService {
  private readonly exportCompositionRepository: ExportCompositionRepository;
  private readonly exportTimelineSegmentRepository: ExportTimelineSegmentRepository;
  private readonly checkpointRepository: CheckpointRepository;
  private readonly audioAssetRepository: AudioAssetRepository;
  private readonly videoAssetRepository: VideoAssetRepository;
  private readonly importedMediaAssetRepository: ImportedMediaAssetRepository;

  public constructor(
    private readonly db: Database.Database,
    private readonly settingsService: SettingsService
  ) {
    this.exportCompositionRepository = new ExportCompositionRepository(db);
    this.exportTimelineSegmentRepository = new ExportTimelineSegmentRepository(db);
    this.checkpointRepository = new CheckpointRepository(db);
    this.audioAssetRepository = new AudioAssetRepository(db);
    this.videoAssetRepository = new VideoAssetRepository(db);
    this.importedMediaAssetRepository = new ImportedMediaAssetRepository(db);
  }

  public getComposition(sessionId: string): ExportCompositionSummary {
    const existingComposition = this.exportCompositionRepository.findBySessionId(sessionId);
    const existingSegments = this.exportTimelineSegmentRepository.listBySessionId(sessionId);
    if (existingComposition) {
      return this.hydrateLegacyAppendix(existingComposition, existingSegments);
    }

    const voiceOverAsset = this.audioAssetRepository.findLatestVoiceOverBySessionId(sessionId);
    const checkpoints = this.checkpointRepository
      .listBySessionId(sessionId)
      .filter((checkpoint) => checkpoint.status === "completed");
    const durationMs = this.getDefaultDurationMs(voiceOverAsset?.durationMs ?? null, checkpoints.length);
    const createdAt = nowIso();
    const composition: ExportCompositionEntity = {
      sessionId,
      voiceOverAssetId: voiceOverAsset?.id ?? null,
      appendixVideoAssetId: null,
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
    const resolvedOutputFilePath =
      input.outputFilePath !== undefined
        ? input.outputFilePath
        : current?.outputFilePath ?? this.getDefaultOutputPath();
    const audioAsset = resolvedVoiceOverAssetId ? this.audioAssetRepository.findById(resolvedVoiceOverAssetId) : null;
    const desiredDurationMs = Math.max(
      input.durationMs ?? current?.durationMs ?? 0,
      audioAsset?.durationMs ?? 0,
      input.segments.at(-1)?.endOffsetMs ?? 0
    );
    const durationMs = desiredDurationMs > 0
      ? desiredDurationMs
      : this.getDefaultDurationMs(audioAsset?.durationMs ?? null, input.segments.length);
    const composition: ExportCompositionEntity = {
      sessionId: input.sessionId,
      voiceOverAssetId: resolvedVoiceOverAssetId ?? null,
      appendixVideoAssetId: null,
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

  private hydrateLegacyAppendix(
    composition: ExportCompositionEntity,
    segments: ExportTimelineSegmentEntity[]
  ): ExportCompositionSummary {
    if (!composition.appendixVideoAssetId) {
      return toSummary(composition, segments);
    }

    const alreadyConverted = segments.some(
      (segment) => segment.sourceKind === "imported_video" && segment.sourceId === composition.appendixVideoAssetId
    );
    if (alreadyConverted) {
      if (composition.appendixVideoAssetId) {
        const cleanedComposition = { ...composition, appendixVideoAssetId: null, updatedAt: nowIso() };
        this.exportCompositionRepository.upsert(cleanedComposition);
        return toSummary(cleanedComposition, segments);
      }

      return toSummary(composition, segments);
    }

    const importedAsset = this.importedMediaAssetRepository.findById(composition.appendixVideoAssetId);
    const legacyVideoAsset = importedAsset ? null : this.videoAssetRepository.findById(composition.appendixVideoAssetId);
    const assetDurationMs = importedAsset?.durationMs ?? legacyVideoAsset?.durationMs ?? DEFAULT_SEGMENT_DURATION_MS;
    const startOffsetMs = Math.max(composition.durationMs, segments.at(-1)?.endOffsetMs ?? 0);
    const endOffsetMs = Math.max(startOffsetMs + MIN_SEGMENT_DURATION_MS, startOffsetMs + assetDurationMs);
    const appendedSegment: ExportTimelineSegmentEntity = {
      id: randomUUID(),
      sessionId: composition.sessionId,
      sourceKind: importedAsset
        ? getImportedSourceKind(importedAsset.kind)
        : "imported_video",
      sourceId: composition.appendixVideoAssetId,
      startOffsetMs,
      endOffsetMs,
      mediaStartOffsetMs: 0,
      sortOrder: segments.length,
      source: "seeded",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const nextSegments = [...segments, appendedSegment];
    const nextComposition: ExportCompositionEntity = {
      ...composition,
      appendixVideoAssetId: null,
      durationMs: appendedSegment.endOffsetMs,
      updatedAt: nowIso()
    };

    this.db.transaction(() => {
      this.exportCompositionRepository.upsert(nextComposition);
      this.exportTimelineSegmentRepository.replaceForSession(composition.sessionId, nextSegments);
    })();

    return toSummary(nextComposition, nextSegments);
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
      sourceKind: "checkpoint",
      sourceId: checkpointId,
      startOffsetMs: index * segmentDurationMs,
      endOffsetMs: index === checkpointIds.length - 1 ? durationMs : (index + 1) * segmentDurationMs,
      mediaStartOffsetMs: 0,
      sortOrder: index,
      source: "seeded",
      createdAt,
      updatedAt: createdAt
    }));
  }
}
