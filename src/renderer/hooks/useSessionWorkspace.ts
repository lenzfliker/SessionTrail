import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AudioAssetSummary,
  ExportCompositionSummary,
  ImportedMediaAssetSummary,
  TimelineCheckpointSummary,
} from "../../shared/contracts";
import {
  getEffectiveVoiceOverDurationMs,
  getPreviewSegment,
  normalizeCompositionDuration,
  type VisualSourceSelection
} from "../utils";

export function useSessionWorkspace(
  selectedSessionId: string | null,
  pendingCheckpointId: string | null
) {
  const [timelineItems, setTimelineItems] = useState<TimelineCheckpointSummary[]>([]);
  const [importedMedia, setImportedMedia] = useState<ImportedMediaAssetSummary[]>([]);
  const [voiceOver, setVoiceOver] = useState<AudioAssetSummary | null>(null);
  const [composition, setComposition] = useState<ExportCompositionSummary | null>(null);
  const [compositionDirty, setCompositionDirty] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [armedVisualSource, setArmedVisualSource] = useState<VisualSourceSelection | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, string | null>>({});
  const [audioPreviewDurationMs, setAudioPreviewDurationMs] = useState<number | null>(null);
  const [audioCurrentTimeMs, setAudioCurrentTimeMs] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [sessionSwitching, setSessionSwitching] = useState(false);
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const resetWorkspace = (sessionId: string | null) => {
    setTimelineItems([]);
    setImportedMedia([]);
    setVoiceOver(null);
    setComposition(null);
    setCompositionDirty(false);
    setSelectedSegmentId(null);
    setSelectedCheckpointId(null);
    setSelectedImportId(null);
    setPlayheadMs(0);
    setArmedVisualSource(null);
    setPreviewCache({});
    setAudioPreviewDurationMs(null);
    setAudioCurrentTimeMs(0);
    lastLoadedSessionIdRef.current = sessionId;
    setLoadedSessionId(sessionId);
  };

  const loadSessionWorkspace = async (sessionId: string | null) => {
    const requestId = ++loadRequestIdRef.current;
    const shouldReset = sessionId !== lastLoadedSessionIdRef.current;
    if (shouldReset) {
      resetWorkspace(sessionId);
    }

    if (!sessionId) {
      setLoadedSessionId(null);
      setSessionSwitching(false);
      setWorkspaceLoading(false);
      return;
    }

    setSessionSwitching(Boolean(lastLoadedSessionIdRef.current && lastLoadedSessionIdRef.current !== sessionId));
    setWorkspaceLoading(true);
    try {
      const [nextItems, nextImportedMedia, nextVoiceOver, nextComposition] = await Promise.all([
        window.sessionTrail.checkpoint.listForSession(sessionId),
        window.sessionTrail.media.listImports(sessionId),
        window.sessionTrail.audio.getLatestVoiceOver(sessionId),
        window.sessionTrail.export.getComposition(sessionId)
      ]);

      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setTimelineItems(nextItems);
      setImportedMedia(nextImportedMedia);
      setVoiceOver(nextVoiceOver);
      setComposition(normalizeCompositionDuration(nextComposition, getEffectiveVoiceOverDurationMs(nextVoiceOver)));
      setCompositionDirty(false);
      setPreviewCache({});
      setSelectedSegmentId((current) =>
        current && nextComposition.segments.some((segment) => segment.id === current)
          ? current
          : nextComposition.segments[0]?.id ?? null
      );
      setSelectedCheckpointId((current) =>
        current && nextItems.some((item) => item.id === current)
          ? current
          : nextComposition.segments.find((segment) => segment.sourceKind === "checkpoint")?.sourceId ?? nextItems[0]?.id ?? null
      );
      setSelectedImportId((current) =>
        current && nextImportedMedia.some((asset) => asset.id === current)
          ? current
          : nextComposition.segments.find((segment) => segment.sourceKind !== "checkpoint")?.sourceId ?? nextImportedMedia[0]?.id ?? null
      );
      setArmedVisualSource((current) => {
        if (current) {
          const checkpointMatch = current.sourceKind === "checkpoint" && nextItems.some((item) => item.id === current.sourceId);
          const importMatch = current.sourceKind !== "checkpoint" && nextImportedMedia.some((asset) => asset.id === current.sourceId);
          if (checkpointMatch || importMatch) {
            return current;
          }
        }

        const checkpoint = nextItems.find((item) => item.thumbnailDataUrl);
        if (checkpoint) {
          return { sourceKind: "checkpoint", sourceId: checkpoint.id };
        }

        const importedAsset = nextImportedMedia[0];
        return importedAsset
          ? { sourceKind: importedAsset.kind === "image" ? "imported_image" : "imported_video", sourceId: importedAsset.id }
          : null;
      });
      setAudioPreviewDurationMs(nextVoiceOver?.durationMs ?? null);
      setAudioCurrentTimeMs(0);
      lastLoadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setWorkspaceLoading(false);
        setSessionSwitching(false);
      }
    }
  };

  useEffect(() => {
    void loadSessionWorkspace(selectedSessionId);
  }, [pendingCheckpointId, selectedSessionId]);

  const checkpointsById = useMemo(
    () => new Map(timelineItems.map((item) => [item.id, item] as const)),
    [timelineItems]
  );
  const importedMediaById = useMemo(
    () => new Map(importedMedia.map((asset) => [asset.id, asset] as const)),
    [importedMedia]
  );
  const selectedSegment =
    composition?.segments.find((segment) => segment.id === selectedSegmentId) ?? null;
  const selectedCheckpoint = selectedCheckpointId
    ? checkpointsById.get(selectedCheckpointId) ?? null
    : null;
  const selectedImport = selectedImportId
    ? importedMediaById.get(selectedImportId) ?? null
    : null;
  const previewSegment = composition ? getPreviewSegment(composition.segments, playheadMs) : null;
  const previewCheckpoint = previewSegment?.sourceKind === "checkpoint"
    ? checkpointsById.get(previewSegment.sourceId) ?? null
    : null;
  const previewImport = previewSegment && previewSegment.sourceKind !== "checkpoint"
    ? importedMediaById.get(previewSegment.sourceId) ?? null
    : null;
  const effectiveVoiceDurationMs = getEffectiveVoiceOverDurationMs(voiceOver);
  const selectedCheckpointThumbnailUrl = selectedCheckpoint?.thumbnailDataUrl ?? null;
  const selectedCheckpointPreviewUrl = selectedCheckpoint ? previewCache[selectedCheckpoint.id] ?? null : null;
  const previewCheckpointThumbnailUrl = previewCheckpoint?.thumbnailDataUrl ?? null;
  const previewCheckpointPreviewUrl = previewCheckpoint ? previewCache[previewCheckpoint.id] ?? null : null;

  useEffect(() => {
    if (!selectedSegment) {
      return;
    }

    if (selectedSegment.sourceKind === "checkpoint") {
      setSelectedCheckpointId(selectedSegment.sourceId);
      setSelectedImportId(null);
      return;
    }

    setSelectedImportId(selectedSegment.sourceId);
    setSelectedCheckpointId(null);
  }, [selectedSegment?.id, selectedSegment?.sourceId, selectedSegment?.sourceKind]);

  useEffect(() => {
    const missingPreviewIds = timelineItems
      .filter((item) => item.thumbnailDataUrl && !Object.prototype.hasOwnProperty.call(previewCache, item.id))
      .map((item) => item.id);

    if (missingPreviewIds.length === 0) {
      return;
    }

    let canceled = false;
    void Promise.all(
      missingPreviewIds.map(async (checkpointId) => [checkpointId, await window.sessionTrail.checkpoint.getScreenshotPreview(checkpointId)] as const)
    ).then((entries) => {
      if (canceled) {
        return;
      }

      setPreviewCache((current) => {
        const nextCache = { ...current };
        for (const [checkpointId, preview] of entries) {
          if (!Object.prototype.hasOwnProperty.call(nextCache, checkpointId)) {
            nextCache[checkpointId] = preview;
          }
        }
        return nextCache;
      });
    });

    return () => {
      canceled = true;
    };
  }, [previewCache, timelineItems]);

  return {
    timelineItems,
    setTimelineItems,
    importedMedia,
    setImportedMedia,
    voiceOver,
    setVoiceOver,
    composition,
    setComposition,
    compositionDirty,
    setCompositionDirty,
    selectedSegmentId,
    setSelectedSegmentId,
    selectedCheckpointId,
    setSelectedCheckpointId,
    selectedImportId,
    setSelectedImportId,
    playheadMs,
    setPlayheadMs,
    armedVisualSource,
    setArmedVisualSource,
    audioPreviewDurationMs,
    setAudioPreviewDurationMs,
    audioCurrentTimeMs,
    setAudioCurrentTimeMs,
    workspaceLoading,
    loadedSessionId,
    sessionSwitching,
    checkpointsById,
    importedMediaById,
    selectedSegment,
    selectedCheckpoint,
    selectedImport,
    previewSegment,
    previewCheckpoint,
    previewImport,
    effectiveVoiceDurationMs,
    selectedCheckpointThumbnailUrl,
    selectedCheckpointPreviewUrl,
    previewCheckpointThumbnailUrl,
    previewCheckpointPreviewUrl,
    loadSessionWorkspace
  };
}
